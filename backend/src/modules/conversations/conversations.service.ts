import { randomBytes } from "node:crypto";
import { requireAuth } from "../../middleware/require-auth";
import { conversationsRepository } from "./conversations.repository";
import {
    ConversationError,
    createConversationTitle,
    createTextMessageParts,
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

    async createConversation(request: Request, input: { content: string }) {
        const user = await requireAuth(request);
        const messageParts = createTextMessageParts(input.content);
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
                messageStatus: "complete"
            });

        return getConversationDetailOrThrow(user.id, conversation.id);
    },

    async createConversationMessage(
        request: Request,
        conversationId: string,
        input: { content: string }
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
            messageParts: createTextMessageParts(input.content),
            messageStatus: "complete"
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
    }
};
