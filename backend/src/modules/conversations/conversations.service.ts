import { randomBytes } from "node:crypto";
import { logger } from "../../lib/logger";
import { requireVerifiedAuth } from "../../middleware/require-auth";
import { generationManager } from "../ai/generation-manager";
import { conversationsRepository } from "./conversations.repository";
import {
    ConversationError,
    createConversationTitle,
    createMessageParts,
    toConversationDetail,
    toConversationSummary,
    type ConversationReadRecord,
    type MessageRecord
} from "./conversations.types";

function createCustomId(prefix: string): string {
    return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function getLatestMessageMap(messages: MessageRecord[]) {
    const byConversationId = new Map<string, MessageRecord>();

    for (const message of messages) {
        if (!byConversationId.has(message.conversationId)) {
            byConversationId.set(message.conversationId, message);
        }
    }

    return byConversationId;
}

function getLatestAssistantMessageMap(messages: MessageRecord[]) {
    const byConversationId = new Map<string, MessageRecord>();

    for (const message of messages) {
        if (message.role !== "assistant") {
            continue;
        }

        if (!byConversationId.has(message.conversationId)) {
            byConversationId.set(message.conversationId, message);
        }
    }

    return byConversationId;
}

function getReadStateMap(readStates: ConversationReadRecord[]) {
    return new Map(
        readStates.map((readState) => [readState.conversationId, readState])
    );
}

const STALE_PENDING_THRESHOLD_MS = 5 * 60 * 1000;
const MAX_CONVERSATION_TITLE_LENGTH = 120;

function normalizeManualConversationTitle(value: string): string {
    const normalized = value.replace(/\s+/g, " ").trim();

    if (!normalized) {
        throw new ConversationError(400, "Conversation title is required.");
    }

    if (normalized.length > MAX_CONVERSATION_TITLE_LENGTH) {
        throw new ConversationError(
            400,
            `Conversation title must be ${MAX_CONVERSATION_TITLE_LENGTH} characters or less.`
        );
    }

    return normalized;
}

async function markStalePendingMessages(
    messages: MessageRecord[],
    conversationId: string
) {
    if (generationManager.isActive(conversationId)) return;

    const now = Date.now();

    for (const message of messages) {
        if (message.role !== "assistant" || message.status !== "pending") continue;

        const metadata = message.metadata as Record<string, unknown> | null;
        const startedAt = metadata?.generationStartedAt;
        if (typeof startedAt !== "string") continue;

        const elapsed = now - new Date(startedAt).getTime();
        if (elapsed <= STALE_PENDING_THRESHOLD_MS) continue;

        await conversationsRepository.updateMessage(message.id, {
            status: "failed",
            metadata: {
                ...(metadata ?? {}),
                generationCompletedAt: new Date().toISOString(),
                failureReason: "stale"
            }
        });
        message.status = "failed";
    }
}

async function getConversationDetailOrThrow(
    userId: string,
    conversationId: string
) {
    const startedAt = Date.now();
    const [conversation, messages, readState] = await Promise.all([
        conversationsRepository.findConversationByIdForUser(
            userId,
            conversationId
        ),
        conversationsRepository.listMessagesByConversationId(conversationId),
        conversationsRepository.findConversationRead(userId, conversationId)
    ]);

    if (!conversation) {
        throw new ConversationError(404, "Conversation not found.");
    }

    await markStalePendingMessages(messages, conversationId);

    logger.info("Conversation detail loaded", {
        userId,
        conversationId,
        messageCount: messages.length,
        durationMs: Date.now() - startedAt
    });

    return toConversationDetail({
        conversation,
        messages,
        readState
    });
}

export const conversationsService = {
    async listConversations(request: Request) {
        const user = await requireVerifiedAuth(request);
        const conversationRecords =
            await conversationsRepository.listConversationsByUserId(user.id);
        const conversationIds = conversationRecords.map(
            (conversation) => conversation.id
        );
        const [messageRecords, readStates] = await Promise.all([
            conversationsRepository.listMessagesByConversationIds(
                conversationIds
            ),
            conversationsRepository.listConversationReadsByConversationIds(
                user.id,
                conversationIds
            )
        ]);
        const latestMessageMap = getLatestMessageMap(messageRecords);
        const latestAssistantMessageMap =
            getLatestAssistantMessageMap(messageRecords);
        const readStateMap = getReadStateMap(readStates);

        return conversationRecords.map((conversation) =>
            toConversationSummary({
                conversation,
                latestMessage: latestMessageMap.get(conversation.id) ?? null,
                latestAssistantMessage:
                    latestAssistantMessageMap.get(conversation.id) ?? null,
                readState: readStateMap.get(conversation.id) ?? null
            })
        );
    },

    async getConversation(request: Request, conversationId: string) {
        const user = await requireVerifiedAuth(request);

        return getConversationDetailOrThrow(user.id, conversationId);
    },

    async createConversation(request: Request, input: { content: string; attachments?: Array<{ data: string; mimeType: string; filename?: string; size?: number }> }) {
        const startedAt = Date.now();
        const user = await requireVerifiedAuth(request);
        const partsStartedAt = Date.now();
        const messageParts = await createMessageParts(
            input.content,
            input.attachments
        );
        const partsDurationMs = Date.now() - partsStartedAt;
        const title = createConversationTitle(input.content, input.attachments);

        const { conversation } =
            await conversationsRepository.createConversationWithInitialMessage({
                conversationId: createCustomId("cv"),
                userId: user.id,
                title,
                titleSource: "prompt",
                messageId: createCustomId("msg"),
                messageRole: "user",
                messageParts,
                messageStatus: "complete",
                messageMetadata: {
                    sentAt: new Date().toISOString()
                }
            });

        const detail = await getConversationDetailOrThrow(user.id, conversation.id);

        logger.info("Conversation created", {
            userId: user.id,
            conversationId: conversation.id,
            attachmentCount: input.attachments?.length ?? 0,
            messagePartsDurationMs: partsDurationMs,
            durationMs: Date.now() - startedAt
        });

        return detail;
    },

    async createConversationMessage(
        request: Request,
        conversationId: string,
        input: {
            content: string;
            attachments?: Array<{ data: string; mimeType: string; filename?: string; size?: number }>;
            parentMessageId?: string | null;
        }
    ) {
        const startedAt = Date.now();
        const user = await requireVerifiedAuth(request);
        const conversation =
            await conversationsRepository.findConversationByIdForUser(
                user.id,
                conversationId
            );

        if (!conversation) {
            throw new ConversationError(404, "Conversation not found.");
        }

        const partsStartedAt = Date.now();
        const messageParts = await createMessageParts(
            input.content,
            input.attachments
        );
        const partsDurationMs = Date.now() - partsStartedAt;

        const result = await conversationsRepository.appendMessageToConversation({
            conversationId,
            messageId: createCustomId("msg"),
            messageRole: "user",
            messageParts,
            messageStatus: "complete",
            messageMetadata: {
                sentAt: new Date().toISOString()
            },
            parentMessageId: input.parentMessageId ?? null
        });

        const detail = await getConversationDetailOrThrow(user.id, conversationId);

        logger.info("Conversation message created", {
            userId: user.id,
            conversationId,
            messageId: result.message.id,
            attachmentCount: input.attachments?.length ?? 0,
            messagePartsDurationMs: partsDurationMs,
            durationMs: Date.now() - startedAt
        });

        return { ...detail, newMessageId: result.message.id };
    },

    async editMessage(
        request: Request,
        conversationId: string,
        messageId: string,
        input: {
            content: string;
            attachments?: Array<{ data: string; mimeType: string; filename?: string; size?: number }>;
        }
    ) {
        const startedAt = Date.now();
        const user = await requireVerifiedAuth(request);
        const conversation =
            await conversationsRepository.findConversationByIdForUser(
                user.id,
                conversationId
            );

        if (!conversation) {
            throw new ConversationError(404, "Conversation not found.");
        }

        const original = await conversationsRepository.findMessageById(
            conversationId,
            messageId
        );

        if (!original) {
            throw new ConversationError(404, "Message not found.");
        }

        if (original.role !== "user") {
            throw new ConversationError(400, "Only user messages can be edited.");
        }

        const partsStartedAt = Date.now();
        const messageParts = await createMessageParts(
            input.content,
            input.attachments
        );
        const partsDurationMs = Date.now() - partsStartedAt;

        const result = await conversationsRepository.appendMessageToConversation({
            conversationId,
            messageId: createCustomId("msg"),
            messageRole: "user",
            messageParts,
            messageStatus: "complete",
            messageMetadata: {
                sentAt: new Date().toISOString()
            },
            parentMessageId: original.parentMessageId ?? null
        });

        const detail = await getConversationDetailOrThrow(user.id, conversationId);

        logger.info("Conversation message edited", {
            userId: user.id,
            conversationId,
            originalMessageId: messageId,
            newMessageId: result.message.id,
            attachmentCount: input.attachments?.length ?? 0,
            messagePartsDurationMs: partsDurationMs,
            durationMs: Date.now() - startedAt
        });

        return { ...detail, newMessageId: result.message.id };
    },

    async markConversationRead(
        request: Request,
        conversationId: string,
        input: { assistantMessageId: string }
    ) {
        const user = await requireVerifiedAuth(request);
        const conversation =
            await conversationsRepository.findConversationByIdForUser(
                user.id,
                conversationId
            );

        if (!conversation) {
            throw new ConversationError(404, "Conversation not found.");
        }

        const message = await conversationsRepository.findMessageById(
            conversationId,
            input.assistantMessageId
        );

        if (!message || message.role !== "assistant") {
            throw new ConversationError(
                400,
                "Only assistant replies can be marked as read."
            );
        }

        await conversationsRepository.upsertConversationRead({
            conversationId,
            userId: user.id,
            lastReadAssistantMessageId: input.assistantMessageId
        });

        return {
            success: true,
            conversationId,
            assistantMessageId: input.assistantMessageId
        };
    },

    async updateConversation(
        request: Request,
        conversationId: string,
        input: { title?: string; isFavorite?: boolean }
    ) {
        const user = await requireVerifiedAuth(request);

        const hasTitleUpdate = input.title !== undefined;
        const hasFavoriteUpdate = input.isFavorite !== undefined;

        if (!hasTitleUpdate && !hasFavoriteUpdate) {
            throw new ConversationError(
                400,
                "Provide at least one field to update."
            );
        }

        const conversation =
            await conversationsRepository.findConversationByIdForUser(
                user.id,
                conversationId
            );

        if (!conversation) {
            throw new ConversationError(404, "Conversation not found.");
        }

        await conversationsRepository.updateConversationByIdForUser(
            user.id,
            conversationId,
            {
                ...(hasTitleUpdate
                    ? {
                          title: normalizeManualConversationTitle(input.title!),
                          titleSource: "manual"
                      }
                    : {}),
                ...(hasFavoriteUpdate ? { isFavorite: input.isFavorite } : {})
            }
        );

        return getConversationDetailOrThrow(user.id, conversationId);
    },

    async deleteConversation(request: Request, conversationId: string) {
        const user = await requireVerifiedAuth(request);

        const deleted = await conversationsRepository.deleteConversationByIdForUser(
            user.id,
            conversationId
        );

        if (!deleted) {
            throw new ConversationError(404, "Conversation not found.");
        }

        if (generationManager.isActive(conversationId)) {
            generationManager.fail(conversationId, "Conversation deleted.");
        }

        return {
            success: true,
            conversationId
        };
    }
};
