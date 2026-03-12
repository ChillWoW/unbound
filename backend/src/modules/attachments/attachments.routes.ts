import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../middleware/require-auth";
import { ConversationError } from "../conversations/conversations.types";
import { attachmentsService } from "./attachments.service";

const attachmentParams = t.Object({
    attachmentId: t.String({ minLength: 1, maxLength: 64 })
});

const attachmentQuery = t.Object({
    download: t.Optional(t.String())
});

function handleAttachmentError(
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

export const attachmentsRoutes = new Elysia({ prefix: "/api/attachments" }).get(
    "/:attachmentId/content",
    async ({ params, query, request, set }) => {
        try {
            return await attachmentsService.getAttachmentContent(
                request,
                params.attachmentId,
                query.download === "1" || query.download === "true"
            );
        } catch (error) {
            return handleAttachmentError(error, set);
        }
    },
    {
        params: attachmentParams,
        query: attachmentQuery
    }
);
