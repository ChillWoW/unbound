import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../middleware/require-auth";
import { ConversationError } from "../conversations/conversations.types";
import { imagesService } from "./images.service";

const conversationParams = t.Object({
    conversationId: t.String({ minLength: 1, maxLength: 64 })
});

const generateImageBody = t.Object({
    modelId: t.String({ minLength: 1, maxLength: 200 }),
    imageConfig: t.Optional(
        t.Object({
            aspectRatio: t.Optional(t.String({ minLength: 3, maxLength: 10 })),
            imageSize: t.Optional(t.String({ minLength: 2, maxLength: 10 }))
        })
    )
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

export const imagesRoutes = new Elysia({ prefix: "/api/conversations" }).post(
    "/:conversationId/generate-image",
    async ({ body, params, request, set }) => {
        try {
            return await imagesService.generateImage(
                request,
                params.conversationId,
                body
            );
        } catch (error) {
            return handleError(error, set);
        }
    },
    {
        body: generateImageBody,
        params: conversationParams
    }
);
