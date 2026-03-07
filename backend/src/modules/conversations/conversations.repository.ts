import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { conversationReads, conversations, messages } from "../../db/schema";
import type {
    ConversationReadRecord,
    ConversationRecord,
    MessagePart,
    MessageRecord,
    MessageRole,
    MessageStatus
} from "./conversations.types";

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

    async listMessagesByConversationIds(conversationIds: string[]) {
        if (conversationIds.length === 0) {
            return [] as MessageRecord[];
        }

        return db
            .select()
            .from(messages)
            .where(inArray(messages.conversationId, conversationIds))
            .orderBy(desc(messages.createdAt));
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
                    lastMessageAt: now
                })
                .returning();

            const [message] = await tx
                .insert(messages)
                .values({
                    id: input.messageId,
                    conversationId: input.conversationId,
                    role: input.messageRole,
                    parts: input.messageParts,
                    status: input.messageStatus,
                    metadata: input.messageMetadata ?? null,
                    createdAt: now
                })
                .returning();

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
    }) {
        return db.transaction(async (tx) => {
            const now = new Date();
            const [message] = await tx
                .insert(messages)
                .values({
                    id: input.messageId,
                    conversationId: input.conversationId,
                    role: input.messageRole,
                    parts: input.messageParts,
                    status: input.messageStatus,
                    metadata: input.messageMetadata ?? null,
                    createdAt: now
                })
                .returning();

            const [conversation] = await tx
                .update(conversations)
                .set({
                    updatedAt: now,
                    lastMessageAt: now
                })
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

        const [updated] = await db
            .update(messages)
            .set(set)
            .where(eq(messages.id, messageId))
            .returning();

        return updated ?? null;
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
