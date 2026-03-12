import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import {
    conversationReads,
    conversations,
    messageAttachments,
    messages
} from "../../db/schema";
import type {
    ConversationReadRecord,
    MessageAttachmentRecord,
    MessagePart,
    MessageRecord,
    MessageRole,
    MessageStatus,
    PreparedMessageAttachment
} from "./conversations.types";
import { getMessagePreview } from "./conversations.types";

function buildConversationMessageSet(input: {
    messageId: string;
    role: MessageRole;
    parts: MessagePart[];
    now: Date;
}) {
    return {
        updatedAt: input.now,
        lastMessageAt: input.now,
        latestMessageId: input.messageId,
        lastMessagePreview: getMessagePreview(input.parts),
        lastMessageRole: input.role,
        ...(input.role === "assistant"
            ? { latestAssistantMessageId: input.messageId }
            : {})
    };
}

export const conversationsRepository = {
    async listConversationsByUserId(userId: string) {
        return db
            .select()
            .from(conversations)
            .where(eq(conversations.userId, userId))
            .orderBy(
                desc(conversations.isFavorite),
                desc(conversations.lastMessageAt),
                desc(conversations.updatedAt)
            );
    },

    async findConversationByIdForUser(userId: string, conversationId: string) {
        const [conversation] = await db
            .select()
            .from(conversations)
            .where(
                and(
                    eq(conversations.id, conversationId),
                    eq(conversations.userId, userId)
                )
            )
            .limit(1);

        return conversation ?? null;
    },

    async listMessagesByConversationId(conversationId: string) {
        return db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(messages.createdAt);
    },

    async listMessageAttachmentsByConversationId(
        conversationId: string
    ): Promise<MessageAttachmentRecord[]> {
        return db
            .select()
            .from(messageAttachments)
            .where(eq(messageAttachments.conversationId, conversationId))
            .orderBy(messageAttachments.createdAt);
    },

    async listMessageAttachmentsByMessageIds(
        messageIds: string[]
    ): Promise<MessageAttachmentRecord[]> {
        if (messageIds.length === 0) {
            return [];
        }

        return db
            .select()
            .from(messageAttachments)
            .where(inArray(messageAttachments.messageId, messageIds))
            .orderBy(messageAttachments.createdAt);
    },

    async findAttachmentByIdForUser(userId: string, attachmentId: string) {
        const [attachment] = await db
            .select({
                id: messageAttachments.id,
                conversationId: messageAttachments.conversationId,
                messageId: messageAttachments.messageId,
                kind: messageAttachments.kind,
                storageKey: messageAttachments.storageKey,
                mimeType: messageAttachments.mimeType,
                filename: messageAttachments.filename,
                size: messageAttachments.size,
                sha256: messageAttachments.sha256,
                extractedText: messageAttachments.extractedText,
                createdAt: messageAttachments.createdAt
            })
            .from(messageAttachments)
            .innerJoin(
                conversations,
                eq(messageAttachments.conversationId, conversations.id)
            )
            .where(
                and(
                    eq(messageAttachments.id, attachmentId),
                    eq(conversations.userId, userId)
                )
            )
            .limit(1);

        return attachment ?? null;
    },

    async findConversationRead(userId: string, conversationId: string) {
        const [readState] = await db
            .select()
            .from(conversationReads)
            .where(
                and(
                    eq(conversationReads.userId, userId),
                    eq(conversationReads.conversationId, conversationId)
                )
            )
            .limit(1);

        return readState ?? null;
    },

    async listConversationReadsByConversationIds(
        userId: string,
        conversationIds: string[]
    ) {
        if (conversationIds.length === 0) {
            return [] as ConversationReadRecord[];
        }

        return db
            .select()
            .from(conversationReads)
            .where(
                and(
                    eq(conversationReads.userId, userId),
                    inArray(conversationReads.conversationId, conversationIds)
                )
            );
    },

    async createConversationWithInitialMessage(input: {
        conversationId: string;
        userId: string;
        title: string;
        titleSource: string;
        messageId: string;
        messageRole: MessageRole;
        messageParts: MessagePart[];
        messageStatus: MessageStatus;
        messageMetadata?: Record<string, unknown> | null;
        messageAttachments?: PreparedMessageAttachment[];
        parentMessageId?: string | null;
    }) {
        return db.transaction(async (tx) => {
            const now = new Date();
            const [conversation] = await tx
                .insert(conversations)
                .values({
                    id: input.conversationId,
                    userId: input.userId,
                    title: input.title,
                    titleSource: input.titleSource,
                    createdAt: now,
                    updatedAt: now,
                    lastMessageAt: now,
                    latestMessageId: input.messageId,
                    lastMessagePreview: getMessagePreview(input.messageParts),
                    lastMessageRole: input.messageRole,
                    latestAssistantMessageId:
                        input.messageRole === "assistant" ? input.messageId : null
                })
                .returning();

            const [message] = await tx
                .insert(messages)
                .values({
                    id: input.messageId,
                    conversationId: input.conversationId,
                    parentMessageId: input.parentMessageId ?? null,
                    role: input.messageRole,
                    parts: input.messageParts,
                    status: input.messageStatus,
                    metadata: input.messageMetadata ?? null,
                    createdAt: now
                })
                .returning();

            if ((input.messageAttachments?.length ?? 0) > 0) {
                await tx.insert(messageAttachments).values(
                    (input.messageAttachments ?? []).map((attachment) => ({
                        id: attachment.id,
                        conversationId: input.conversationId,
                        messageId: input.messageId,
                        kind: attachment.kind,
                        storageKey: attachment.storageKey,
                        mimeType: attachment.mimeType,
                        filename: attachment.filename,
                        size: attachment.size,
                        sha256: attachment.sha256,
                        extractedText: attachment.extractedText ?? null,
                        createdAt: now
                    }))
                );
            }

            if (!conversation || !message) {
                throw new Error("Failed to create conversation.");
            }

            return { conversation, message };
        });
    },

    async appendMessageToConversation(input: {
        conversationId: string;
        messageId: string;
        messageRole: MessageRole;
        messageParts: MessagePart[];
        messageStatus: MessageStatus;
        messageMetadata?: Record<string, unknown> | null;
        messageAttachments?: PreparedMessageAttachment[];
        parentMessageId?: string | null;
    }) {
        return db.transaction(async (tx) => {
            const now = new Date();
            const [message] = await tx
                .insert(messages)
                .values({
                    id: input.messageId,
                    conversationId: input.conversationId,
                    parentMessageId: input.parentMessageId ?? null,
                    role: input.messageRole,
                    parts: input.messageParts,
                    status: input.messageStatus,
                    metadata: input.messageMetadata ?? null,
                    createdAt: now
                })
                .returning();

            if ((input.messageAttachments?.length ?? 0) > 0) {
                await tx.insert(messageAttachments).values(
                    (input.messageAttachments ?? []).map((attachment) => ({
                        id: attachment.id,
                        conversationId: input.conversationId,
                        messageId: input.messageId,
                        kind: attachment.kind,
                        storageKey: attachment.storageKey,
                        mimeType: attachment.mimeType,
                        filename: attachment.filename,
                        size: attachment.size,
                        sha256: attachment.sha256,
                        extractedText: attachment.extractedText ?? null,
                        createdAt: now
                    }))
                );
            }

            const [conversation] = await tx
                .update(conversations)
                .set(
                    buildConversationMessageSet({
                        messageId: input.messageId,
                        role: input.messageRole,
                        parts: input.messageParts,
                        now
                    })
                )
                .where(eq(conversations.id, input.conversationId))
                .returning();

            if (!message || !conversation) {
                throw new Error("Failed to append message.");
            }

            return { conversation, message };
        });
    },

    async findMessageById(conversationId: string, messageId: string) {
        const [message] = await db
            .select()
            .from(messages)
            .where(
                and(
                    eq(messages.id, messageId),
                    eq(messages.conversationId, conversationId)
                )
            )
            .limit(1);

        return message ?? null;
    },

    async getMessageAncestorChain(
        conversationId: string,
        messageId: string
    ): Promise<MessageRecord[]> {
        const allMessages = await db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conversationId));

        const byId = new Map(allMessages.map((message) => [message.id, message]));
        const chain: MessageRecord[] = [];
        let current = byId.get(messageId);

        while (current) {
            chain.unshift(current);
            current = current.parentMessageId
                ? byId.get(current.parentMessageId)
                : undefined;
        }

        return chain;
    },

    async updateMessage(
        messageId: string,
        input: {
            parts?: MessagePart[];
            status?: MessageStatus;
            metadata?: Record<string, unknown> | null;
        }
    ) {
        const set: Record<string, unknown> = {};

        if (input.parts !== undefined) set.parts = input.parts;
        if (input.status !== undefined) set.status = input.status;
        if (input.metadata !== undefined) set.metadata = input.metadata;

        if (Object.keys(set).length === 0) return null;

        return db.transaction(async (tx) => {
            const [updated] = await tx
                .update(messages)
                .set(set)
                .where(eq(messages.id, messageId))
                .returning();

            if (!updated) {
                return null;
            }

            if (input.parts !== undefined) {
                const [conversation] = await tx
                    .select()
                    .from(conversations)
                    .where(eq(conversations.id, updated.conversationId))
                    .limit(1);

                if (conversation && conversation.latestMessageId === updated.id) {
                    await tx
                        .update(conversations)
                        .set({
                            updatedAt: new Date(),
                            lastMessagePreview: getMessagePreview(updated.parts as MessagePart[]),
                            lastMessageRole: updated.role,
                            ...(updated.role === "assistant"
                                ? { latestAssistantMessageId: updated.id }
                                : {})
                        })
                        .where(eq(conversations.id, updated.conversationId));
                }
            }

            return updated;
        });
    },

    async upsertConversationRead(input: {
        conversationId: string;
        userId: string;
        lastReadAssistantMessageId: string;
    }) {
        const now = new Date();

        const [readState] = await db
            .insert(conversationReads)
            .values({
                conversationId: input.conversationId,
                userId: input.userId,
                lastReadAssistantMessageId: input.lastReadAssistantMessageId,
                lastReadAt: now,
                createdAt: now,
                updatedAt: now
            })
            .onConflictDoUpdate({
                target: [
                    conversationReads.conversationId,
                    conversationReads.userId
                ],
                set: {
                    lastReadAssistantMessageId:
                        input.lastReadAssistantMessageId,
                    lastReadAt: now,
                    updatedAt: now
                }
            })
            .returning();

        return readState ?? null;
    },

    async updateConversationByIdForUser(
        userId: string,
        conversationId: string,
        input: {
            title?: string;
            titleSource?: string;
            isFavorite?: boolean;
        }
    ) {
        const set: {
            title?: string;
            titleSource?: string;
            isFavorite?: boolean;
            updatedAt: Date;
        } = {
            updatedAt: new Date()
        };

        if (input.title !== undefined) {
            set.title = input.title;
        }

        if (input.titleSource !== undefined) {
            set.titleSource = input.titleSource;
        }

        if (input.isFavorite !== undefined) {
            set.isFavorite = input.isFavorite;
        }

        const [updated] = await db
            .update(conversations)
            .set(set)
            .where(
                and(
                    eq(conversations.id, conversationId),
                    eq(conversations.userId, userId)
                )
            )
            .returning();

        return updated ?? null;
    },

    async updateConversationTitleIfSourceMatches(input: {
        userId: string;
        conversationId: string;
        expectedTitleSource: string;
        title: string;
        titleSource: string;
    }) {
        const [updated] = await db
            .update(conversations)
            .set({
                title: input.title,
                titleSource: input.titleSource,
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(conversations.id, input.conversationId),
                    eq(conversations.userId, input.userId),
                    eq(conversations.titleSource, input.expectedTitleSource)
                )
            )
            .returning();

        return updated ?? null;
    },

    async deleteConversationByIdForUser(userId: string, conversationId: string) {
        const [deleted] = await db
            .delete(conversations)
            .where(
                and(
                    eq(conversations.id, conversationId),
                    eq(conversations.userId, userId)
                )
            )
            .returning({ id: conversations.id });

        return deleted ?? null;
    }
};
