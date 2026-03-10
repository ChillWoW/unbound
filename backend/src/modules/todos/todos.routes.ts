import { Elysia, t } from "elysia";
import {
    UnauthorizedError,
    requireVerifiedAuth
} from "../../middleware/require-auth";
import { todosRepository } from "./todos.repository";
import { conversationsRepository } from "../conversations/conversations.repository";
import { ConversationError } from "../conversations/conversations.types";

const todoParams = t.Object({
    conversationId: t.String({ minLength: 1, maxLength: 64 }),
    todoId: t.String({ minLength: 1, maxLength: 128 })
});

const conversationParams = t.Object({
    conversationId: t.String({ minLength: 1, maxLength: 64 })
});

const updateTodoBody = t.Object({
    status: t.Union([
        t.Literal("pending"),
        t.Literal("in_progress"),
        t.Literal("completed"),
        t.Literal("cancelled")
    ])
});

function handleError(error: unknown, set: { status?: number | string }) {
    if (error instanceof UnauthorizedError) {
        set.status = error.status;
        return { message: error.message };
    }
    if (error instanceof ConversationError) {
        set.status = error.status;
        return { message: error.message };
    }
    throw error;
}

export const todosRoutes = new Elysia({
    prefix: "/api/conversations"
})
    .get(
        "/:conversationId/todos",
        async ({ params, request, set }) => {
            try {
                const user = await requireVerifiedAuth(request);
                const conversation =
                    await conversationsRepository.findConversationByIdForUser(
                        user.id,
                        params.conversationId
                    );

                if (!conversation) {
                    throw new ConversationError(
                        404,
                        "Conversation not found."
                    );
                }

                const todos = await todosRepository.listByConversationId(
                    params.conversationId
                );

                return {
                    todos: todos.map((t) => ({
                        id: t.id,
                        content: t.content,
                        status: t.status,
                        priority: t.priority,
                        position: t.position,
                        createdAt: t.createdAt.toISOString(),
                        updatedAt: t.updatedAt.toISOString()
                    }))
                };
            } catch (error) {
                return handleError(error, set);
            }
        },
        { params: conversationParams }
    )
    .patch(
        "/:conversationId/todos/:todoId",
        async ({ body, params, request, set }) => {
            try {
                const user = await requireVerifiedAuth(request);
                const conversation =
                    await conversationsRepository.findConversationByIdForUser(
                        user.id,
                        params.conversationId
                    );

                if (!conversation) {
                    throw new ConversationError(
                        404,
                        "Conversation not found."
                    );
                }

                const updated = await todosRepository.updateStatus(
                    params.conversationId,
                    params.todoId,
                    body.status
                );

                if (!updated) {
                    set.status = 404;
                    return { message: "Todo not found." };
                }

                return {
                    todo: {
                        id: updated.id,
                        content: updated.content,
                        status: updated.status,
                        priority: updated.priority,
                        position: updated.position,
                        createdAt: updated.createdAt.toISOString(),
                        updatedAt: updated.updatedAt.toISOString()
                    }
                };
            } catch (error) {
                return handleError(error, set);
            }
        },
        { body: updateTodoBody, params: todoParams }
    );
