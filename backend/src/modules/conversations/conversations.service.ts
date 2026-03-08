import { randomBytes } from "node:crypto";
import { requireAuth } from "../../middleware/require-auth";
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
    const conversation =
        await conversationsRepository.findConversationByIdForUser(
            userId,
            conversationId
        );

    if (!conversation) {
        throw new ConversationError(404, "Conversation not found.");
    }

    const [messages, readState] = await Promise.all([
        conversationsRepository.listMessagesByConversationId(conversationId),
        conversationsRepository.findConversationRead(userId, conversationId)
    ]);

    await markStalePendingMessages(messages, conversationId);

    return toConversationDetail({
        conversation,
        messages,
        readState
    });
}

export const conversationsService = {
    async listConversations(request: Request) {
        const user = await requireAuth(request);
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
        const user = await requireAuth(request);

        return getConversationDetailOrThrow(user.id, conversationId);
    },

    async createConversation(request: Request, input: { content: string; attachments?: Array<{ data: string; mimeType: string }> }) {
        const user = await requireAuth(request);
        const messageParts = createMessageParts(input.content, input.attachments);
        const title = createConversationTitle(input.content);

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

        return getConversationDetailOrThrow(user.id, conversation.id);
    },

    async createConversationMessage(
        request: Request,
        conversationId: string,
        input: { content: string; attachments?: Array<{ data: string; mimeType: string }> }
    ) {
        const user = await requireAuth(request);
        const conversation =
            await conversationsRepository.findConversationByIdForUser(
                user.id,
                conversationId
            );

        if (!conversation) {
            throw new ConversationError(404, "Conversation not found.");
        }

        await conversationsRepository.appendMessageToConversation({
            conversationId,
            messageId: createCustomId("msg"),
            messageRole: "user",
            messageParts: createMessageParts(input.content, input.attachments),
            messageStatus: "complete",
            messageMetadata: {
                sentAt: new Date().toISOString()
            }
        });

        return getConversationDetailOrThrow(user.id, conversationId);
    },

    async markConversationRead(
        request: Request,
        conversationId: string,
        input: { assistantMessageId: string }
    ) {
        const user = await requireAuth(request);
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
        const user = await requireAuth(request);

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
        const user = await requireAuth(request);

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
