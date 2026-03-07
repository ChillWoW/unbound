import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../middleware/require-auth";
import { conversationsService } from "./conversations.service";
import { ConversationError } from "./conversations.types";

const conversationParams = t.Object({
    conversationId: t.String({ minLength: 1, maxLength: 64 })
});

const attachmentSchema = t.Object({
    data: t.String({ minLength: 1 }),
    mimeType: t.String({ minLength: 1 })
});

const messageBody = t.Object({
    content: t.String({ maxLength: 12000 }),
    attachments: t.Optional(t.Array(attachmentSchema, { maxItems: 10 }))
});

const readBody = t.Object({
    assistantMessageId: t.String({ minLength: 1, maxLength: 64 })
});

function handleConversationError(
    error: unknown,
    set: { status?: number | string }
) {
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

export const conversationsRoutes = new Elysia({ prefix: "/api/conversations" })
    .get("/", async ({ request, set }) => {
        try {
            const conversations =
                await conversationsService.listConversations(request);

            return { conversations };
        } catch (error) {
            return handleConversationError(error, set);
        }
    })
    .post(
        "/",
        async ({ body, request, set }) => {
            try {
                const conversation =
                    await conversationsService.createConversation(
                        request,
                        body
                    );

                set.status = 201;
                return { conversation };
            } catch (error) {
                return handleConversationError(error, set);
            }
        },
        {
            body: messageBody
        }
    )
    .get(
        "/:conversationId",
        async ({ params, request, set }) => {
            try {
                const conversation = await conversationsService.getConversation(
                    request,
                    params.conversationId
                );

                return { conversation };
            } catch (error) {
                return handleConversationError(error, set);
            }
        },
        {
            params: conversationParams
        }
    )
    .post(
        "/:conversationId/messages",
        async ({ body, params, request, set }) => {
            try {
                const conversation =
                    await conversationsService.createConversationMessage(
                        request,
                        params.conversationId,
                        body
                    );

                set.status = 201;
                return { conversation };
            } catch (error) {
                return handleConversationError(error, set);
            }
        },
        {
            body: messageBody,
            params: conversationParams
        }
    )
    .post(
        "/:conversationId/read",
        async ({ body, params, request, set }) => {
            try {
                return await conversationsService.markConversationRead(
                    request,
                    params.conversationId,
                    body
                );
            } catch (error) {
                return handleConversationError(error, set);
            }
        },
        {
            body: readBody,
            params: conversationParams
        }
    );
