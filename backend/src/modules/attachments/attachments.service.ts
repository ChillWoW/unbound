import { requireVerifiedAuth } from "../../middleware/require-auth";
import { conversationsRepository } from "../conversations/conversations.repository";
import { ConversationError } from "../conversations/conversations.types";
import { blobStorage } from "./blob-storage";

export const attachmentsService = {
    async getAttachmentContent(
        request: Request,
        attachmentId: string,
        download = false
    ) {
        const user = await requireVerifiedAuth(request);
        const attachment = await conversationsRepository.findAttachmentByIdForUser(
            user.id,
            attachmentId
        );

        if (!attachment) {
            throw new ConversationError(404, "Attachment not found.");
        }

        return blobStorage.createContentResponse({
            storageKey: attachment.storageKey,
            mimeType: attachment.mimeType,
            filename: attachment.filename,
            download
        });
    }
};
