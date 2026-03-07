import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../middleware/require-auth";
import { ConversationError } from "../conversations/conversations.types";
import { aiService } from "./ai.service";

const conversationParams = t.Object({
    conversationId: t.String({ minLength: 1, maxLength: 64 })
});

const generateBody = t.Object({
    modelId: t.String({ minLength: 1, maxLength: 200 })
});

function handleAiError(error: unknown, set: { status?: number | string }) {
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

export const aiRoutes = new Elysia({ prefix: "/api/conversations" })
    .post(
        "/:conversationId/generate",
        async ({ body, params, request, set }) => {
            try {
                return await aiService.generateResponse(
                    request,
                    params.conversationId,
                    body.modelId
                );
            } catch (error) {
                return handleAiError(error, set);
            }
        },
        {
            body: generateBody,
            params: conversationParams
        }
    )
    .get(
        "/:conversationId/generation",
        async ({ params, request, set }) => {
            try {
                return await aiService.subscribeToGeneration(
                    request,
                    params.conversationId
                );
            } catch (error) {
                return handleAiError(error, set);
            }
        },
        {
            params: conversationParams
        }
    );
