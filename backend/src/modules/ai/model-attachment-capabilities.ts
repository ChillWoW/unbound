import type { ProviderType } from "../../lib/provider-registry";
import type { MessageRecord } from "../conversations/conversations.types";
import { modelsService } from "../models/models.service";

export interface ModelAttachmentCapabilities {
    supportsImageInput: boolean | null;
    supportsNativeFileInput: boolean;
}

export interface ConversationAttachmentRequirements {
    hasImages: boolean;
    hasFiles: boolean;
}

export function inspectConversationAttachmentRequirements(
    records: MessageRecord[]
): ConversationAttachmentRequirements {
    let hasImages = false;
    let hasFiles = false;

    for (const record of records) {
        const parts = Array.isArray(record.parts)
            ? (record.parts as Array<{ type?: string }>)
            : [];

        for (const part of parts) {
            if (part.type === "image") {
                hasImages = true;
            }

            if (part.type === "file") {
                hasFiles = true;
            }

            if (hasImages && hasFiles) {
                return { hasImages, hasFiles };
            }
        }
    }

    return { hasImages, hasFiles };
}

export function resolveModelAttachmentCapabilities(input: {
    userId: string;
    modelId: string;
    provider: ProviderType;
}): ModelAttachmentCapabilities {
    const modalities = modelsService.getModelInputModalities(
        input.userId,
        input.modelId,
        input.provider
    );

    return {
        supportsImageInput: modalities ? modalities.includes("image") : null,
        supportsNativeFileInput: modalities ? modalities.includes("file") : false
    };
}
