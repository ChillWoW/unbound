import { tool } from "ai";
import { z } from "zod";
import { todosRepository } from "../todos/todos.repository";

function formatTodos(
    todos: Awaited<ReturnType<typeof todosRepository.listByConversationId>>
) {
    return todos.map((t) => ({
        id: t.id,
        content: t.content,
        status: t.status,
        priority: t.priority,
        position: t.position,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString()
    }));
}

export function createTools(conversationId: string, userId: string) {
    return {
        todoWrite: tool({
            description:
                "Create or update todos for the current conversation. Use merge=true to update existing todos by id and add new ones. Use merge=false to replace the entire list. Keep exactly one task in_progress, and mark tasks completed as soon as they are done.",
            inputSchema: z.object({
                todos: z
                    .array(
                        z.object({
                            id: z
                                .string()
                                .describe(
                                    "Unique identifier for the todo (short slug, e.g. 'setup-db')"
                                ),
                            content: z
                                .string()
                                .describe("Description of the todo item"),
                            status: z.enum([
                                "pending",
                                "in_progress",
                                "completed",
                                "cancelled"
                            ]),
                            priority: z
                                .enum(["low", "medium", "high"])
                                .optional()
                                .describe("Defaults to medium if not provided")
                        })
                    )
                    .min(1),
                merge: z
                    .boolean()
                    .describe(
                        "true = upsert by id, keeping unmentioned todos. false = replace entire list."
                    )
            }),
            execute: async ({ todos, merge }) => {
                const updated = await todosRepository.upsertTodos(
                    conversationId,
                    userId,
                    todos,
                    merge
                );
                return { todos: formatTodos(updated) };
            }
        }),

        todoRead: tool({
            description:
                "Read the current todo list for this conversation. Returns all todos ordered by position.",
            inputSchema: z.object({}),
            execute: async () => {
                const todos =
                    await todosRepository.listByConversationId(conversationId);
                return { todos: formatTodos(todos) };
            }
        }),

        todoSetStatus: tool({
            description:
                "Update the status of a single todo item. Use this for quick status changes without rewriting the whole list. Before finalizing your response, avoid leaving stale in_progress tasks.",
            inputSchema: z.object({
                todoId: z.string().describe("The id of the todo to update"),
                status: z.enum([
                    "pending",
                    "in_progress",
                    "completed",
                    "cancelled"
                ])
            }),
            execute: async ({ todoId, status }) => {
                await todosRepository.updateStatus(
                    conversationId,
                    todoId,
                    status
                );
                const todos =
                    await todosRepository.listByConversationId(conversationId);
                return { todos: formatTodos(todos) };
            }
        }),

        todoDelete: tool({
            description:
                "Delete specific todos by their ids. Returns the remaining todos.",
            inputSchema: z.object({
                todoIds: z
                    .array(z.string())
                    .min(1)
                    .describe("Array of todo ids to delete")
            }),
            execute: async ({ todoIds }) => {
                await todosRepository.deleteTodos(conversationId, todoIds);
                const todos =
                    await todosRepository.listByConversationId(conversationId);
                return { todos: formatTodos(todos) };
            }
        })
    };
}
