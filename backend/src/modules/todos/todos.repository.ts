import { and, asc, eq, inArray, max } from "drizzle-orm";
import { db } from "../../db/client";
import { todoItems } from "../../db/schema";

export interface TodoRecord {
    id: string;
    conversationId: string;
    userId: string;
    content: string;
    status: string;
    priority: string;
    position: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface TodoInput {
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
    priority?: "low" | "medium" | "high";
}

export const todosRepository = {
    async listByConversationId(conversationId: string): Promise<TodoRecord[]> {
        return db
            .select()
            .from(todoItems)
            .where(eq(todoItems.conversationId, conversationId))
            .orderBy(asc(todoItems.position));
    },

    async getNextPosition(conversationId: string): Promise<number> {
        const [result] = await db
            .select({ maxPos: max(todoItems.position) })
            .from(todoItems)
            .where(eq(todoItems.conversationId, conversationId));

        return (result?.maxPos ?? -1) + 1;
    },

    async upsertTodos(
        conversationId: string,
        userId: string,
        todos: TodoInput[],
        merge: boolean
    ): Promise<TodoRecord[]> {
        return db.transaction(async (tx) => {
            if (!merge) {
                await tx
                    .delete(todoItems)
                    .where(eq(todoItems.conversationId, conversationId));
            }

            const now = new Date();

            let nextPosition: number;
            if (merge) {
                const [result] = await tx
                    .select({ maxPos: max(todoItems.position) })
                    .from(todoItems)
                    .where(eq(todoItems.conversationId, conversationId));
                nextPosition = (result?.maxPos ?? -1) + 1;
            } else {
                nextPosition = 0;
            }

            for (const todo of todos) {
                if (merge) {
                    const [existing] = await tx
                        .select()
                        .from(todoItems)
                        .where(
                            and(
                                eq(todoItems.id, todo.id),
                                eq(todoItems.conversationId, conversationId)
                            )
                        )
                        .limit(1);

                    if (existing) {
                        await tx
                            .update(todoItems)
                            .set({
                                content: todo.content,
                                status: todo.status,
                                priority: todo.priority ?? existing.priority,
                                updatedAt: now
                            })
                            .where(eq(todoItems.id, todo.id));
                        continue;
                    }
                }

                await tx.insert(todoItems).values({
                    id: todo.id,
                    conversationId,
                    userId,
                    content: todo.content,
                    status: todo.status,
                    priority: todo.priority ?? "medium",
                    position: nextPosition++,
                    createdAt: now,
                    updatedAt: now
                });
            }

            return tx
                .select()
                .from(todoItems)
                .where(eq(todoItems.conversationId, conversationId))
                .orderBy(asc(todoItems.position));
        });
    },

    async updateStatus(
        conversationId: string,
        todoId: string,
        status: string
    ): Promise<TodoRecord | null> {
        const [updated] = await db
            .update(todoItems)
            .set({ status, updatedAt: new Date() })
            .where(
                and(
                    eq(todoItems.id, todoId),
                    eq(todoItems.conversationId, conversationId)
                )
            )
            .returning();

        return updated ?? null;
    },

    async deleteTodos(
        conversationId: string,
        todoIds: string[]
    ): Promise<void> {
        if (todoIds.length === 0) return;

        await db
            .delete(todoItems)
            .where(
                and(
                    inArray(todoItems.id, todoIds),
                    eq(todoItems.conversationId, conversationId)
                )
            );
    }
};
