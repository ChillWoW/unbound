import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { userMemories } from "../../db/schema";
import type {
    MemoryConfidence,
    MemoryKind,
    MemorySource,
    UserMemoryRecord
} from "./memory.types";

export const memoryRepository = {
    async listByUserId(userId: string): Promise<UserMemoryRecord[]> {
        return db
            .select()
            .from(userMemories)
            .where(eq(userMemories.userId, userId))
            .orderBy(desc(userMemories.updatedAt));
    },

    async findByIdForUser(
        userId: string,
        memoryId: string
    ): Promise<UserMemoryRecord | null> {
        const [memory] = await db
            .select()
            .from(userMemories)
            .where(
                and(
                    eq(userMemories.userId, userId),
                    eq(userMemories.id, memoryId)
                )
            )
            .limit(1);

        return memory ?? null;
    },

    async insertMemory(input: {
        id: string;
        userId: string;
        kind: MemoryKind;
        content: string;
        confidence: MemoryConfidence;
        keywords: string[];
        source: MemorySource;
    }): Promise<UserMemoryRecord> {
        const now = new Date();
        const [memory] = await db
            .insert(userMemories)
            .values({
                id: input.id,
                userId: input.userId,
                kind: input.kind,
                content: input.content,
                confidence: input.confidence,
                keywords: input.keywords,
                source: input.source,
                createdAt: now,
                updatedAt: now,
                lastAccessedAt: null
            })
            .returning();

        if (!memory) {
            throw new Error("Failed to create memory.");
        }

        return memory;
    },

    async updateMemory(
        userId: string,
        memoryId: string,
        input: {
            kind?: MemoryKind;
            content?: string;
            confidence?: MemoryConfidence;
            keywords?: string[];
            source?: MemorySource;
            lastAccessedAt?: Date | null;
        }
    ): Promise<UserMemoryRecord | null> {
        const [memory] = await db
            .update(userMemories)
            .set({
                ...(input.kind !== undefined ? { kind: input.kind } : {}),
                ...(input.content !== undefined ? { content: input.content } : {}),
                ...(input.confidence !== undefined
                    ? { confidence: input.confidence }
                    : {}),
                ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
                ...(input.source !== undefined ? { source: input.source } : {}),
                ...(input.lastAccessedAt !== undefined
                    ? { lastAccessedAt: input.lastAccessedAt }
                    : {}),
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(userMemories.userId, userId),
                    eq(userMemories.id, memoryId)
                )
            )
            .returning();

        return memory ?? null;
    },

    async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
        const deleted = await db
            .delete(userMemories)
            .where(
                and(
                    eq(userMemories.userId, userId),
                    eq(userMemories.id, memoryId)
                )
            )
            .returning({ id: userMemories.id });

        return deleted.length > 0;
    },

    async touchMemories(userId: string, memoryIds: string[]): Promise<void> {
        if (memoryIds.length === 0) {
            return;
        }

        await db
            .update(userMemories)
            .set({ lastAccessedAt: new Date() })
            .where(
                and(
                    eq(userMemories.userId, userId),
                    inArray(userMemories.id, memoryIds)
                )
            );
    }
};
