import { randomBytes } from "node:crypto";
import { requireAuth } from "../../middleware/require-auth";
import { logger } from "../../lib/logger";
import { generationManager } from "../ai/generation-manager";
import { conversationsRepository } from "../conversations/conversations.repository";
import {
    ConversationError,
    type MessagePart,
    type MessageRecord
} from "../conversations/conversations.types";
import { settingsService } from "../settings/settings.service";

const OPENROUTER_CHAT_COMPLETIONS_URL =
    "https://openrouter.ai/api/v1/chat/completions";

const IMAGE_MODEL_CONFIG: Record<
    string,
    {
        modalities: string[];
        supportsImageSize: boolean;
    }
> = {
    "bytedance-seed/seedream-4.5": {
        modalities: ["image"],
        supportsImageSize: false
    },
    "google/gemini-3.1-flash-image-preview": {
        modalities: ["image", "text"],
        supportsImageSize: true
    }
};

const DATA_URL_REGEX = /^data:([^;,]+);base64,(.+)$/;

function createMessageId(): string {
    return `msg_${randomBytes(10).toString("hex")}`;
}

function getErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const root = payload as Record<string, unknown>;

    if (typeof root.message === "string" && root.message.trim()) {
        return root.message.trim();
    }

    if (root.error && typeof root.error === "object") {
        const error = root.error as Record<string, unknown>;
        if (typeof error.message === "string" && error.message.trim()) {
            return error.message.trim();
        }
    }

    return null;
}

function toOpenRouterUserContent(latestUserMessage: MessageRecord) {
    const parts = latestUserMessage.parts as MessagePart[];
    const content: Array<Record<string, unknown>> = [];

    for (const part of parts) {
        if (part.type === "text" && part.text.trim()) {
            content.push({ type: "text", text: part.text });
            continue;
        }

        if (part.type === "image" && part.data && part.mimeType) {
            content.push({
                type: "image_url",
                image_url: {
                    url: `data:${part.mimeType};base64,${part.data}`
                }
            });
            continue;
        }

        if (part.type === "file") {
            content.push({
                type: "text",
                text: `[Attached file (${part.mimeType})]`
            });
        }
    }

    if (content.length === 0) {
        throw new ConversationError(
            400,
            "Please include a prompt before generating an image."
        );
    }

    const firstContent = content[0];

    if (
        content.length === 1 &&
        firstContent &&
        firstContent.type === "text" &&
        typeof firstContent.text === "string"
    ) {
        return firstContent.text;
    }

    return content;
}

function extractAssistantText(message: unknown): string {
    if (!message || typeof message !== "object") {
        return "";
    }

    const msg = message as Record<string, unknown>;

    if (typeof msg.content === "string") {
        return msg.content.trim();
    }

    if (!Array.isArray(msg.content)) {
        return "";
    }

    const text = msg.content
        .flatMap((item) => {
            if (!item || typeof item !== "object") return [];

            const part = item as Record<string, unknown>;
            if (part.type !== "text" || typeof part.text !== "string") {
                return [];
            }

            return [part.text.trim()];
        })
        .filter(Boolean)
        .join("\n\n");

    return text.trim();
}

function extractImageUrls(message: unknown): string[] {
    if (!message || typeof message !== "object") {
        return [];
    }

    const msg = message as Record<string, unknown>;
    const urls: string[] = [];

    if (Array.isArray(msg.images)) {
        for (const image of msg.images) {
            if (!image || typeof image !== "object") continue;
            const obj = image as Record<string, unknown>;
            const imageUrl =
                obj.image_url && typeof obj.image_url === "object"
                    ? (obj.image_url as Record<string, unknown>)
                    : obj.imageUrl && typeof obj.imageUrl === "object"
                      ? (obj.imageUrl as Record<string, unknown>)
                      : null;

            if (imageUrl && typeof imageUrl.url === "string") {
                urls.push(imageUrl.url);
            }
        }
    }

    if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
            if (!item || typeof item !== "object") continue;
            const part = item as Record<string, unknown>;
            if (part.type !== "image_url") continue;

            const imageUrl =
                part.image_url && typeof part.image_url === "object"
                    ? (part.image_url as Record<string, unknown>)
                    : null;

            if (imageUrl && typeof imageUrl.url === "string") {
                urls.push(imageUrl.url);
            }
        }
    }

    return urls;
}

function imagePartsFromUrls(urls: string[]): Array<{
    type: "image";
    data: string;
    mimeType: string;
}> {
    const seen = new Set<string>();
    const parts: Array<{
        type: "image";
        data: string;
        mimeType: string;
    }> = [];

    for (const url of urls) {
        const match = DATA_URL_REGEX.exec(url);
        if (!match) continue;

        const mimeType = match[1]?.trim();
        const data = match[2]?.trim();

        if (!mimeType || !data) continue;

        const key = `${mimeType}:${data.slice(0, 32)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        parts.push({
            type: "image",
            data,
            mimeType
        });
    }

    return parts;
}

function normalizeImageConfig(
    modelId: string,
    input?: { aspectRatio?: string; imageSize?: string }
): Record<string, string> | undefined {
    if (!input) return undefined;

    const config = IMAGE_MODEL_CONFIG[modelId];
    if (!config) return undefined;

    const next: Record<string, string> = {};

    const aspectRatio = input.aspectRatio?.trim();
    if (aspectRatio) {
        next.aspect_ratio = aspectRatio;
    }

    const imageSize = input.imageSize?.trim();
    if (imageSize && config.supportsImageSize) {
        next.image_size = imageSize;
    }

    return Object.keys(next).length > 0 ? next : undefined;
}

export const imagesService = {
    async generateImage(
        request: Request,
        conversationId: string,
        input: {
            modelId: string;
            imageConfig?: {
                aspectRatio?: string;
                imageSize?: string;
            };
        }
    ) {
        const user = await requireAuth(request);

        const modelConfig = IMAGE_MODEL_CONFIG[input.modelId];

        if (!modelConfig) {
            throw new ConversationError(400, "Unsupported image model.");
        }

        if (generationManager.isActive(conversationId)) {
            throw new ConversationError(
                409,
                "A text generation is in progress. Please wait until it finishes."
            );
        }

        const apiKey =
            await settingsService.getDecryptedOpenRouterApiKeyForUser(user.id);

        if (!apiKey) {
            throw new ConversationError(
                400,
                "Add your OpenRouter API key in settings to generate images."
            );
        }

        const conversation =
            await conversationsRepository.findConversationByIdForUser(
                user.id,
                conversationId
            );

        if (!conversation) {
            throw new ConversationError(404, "Conversation not found.");
        }

        const messages =
            await conversationsRepository.listMessagesByConversationId(
                conversationId
            );

        const latestUserMessage = [...messages]
            .reverse()
            .find((message) => message.role === "user");

        if (!latestUserMessage) {
            throw new ConversationError(
                400,
                "Add a prompt before generating an image."
            );
        }

        const assistantMessageId = createMessageId();
        const generationStartedAt = new Date().toISOString();
        const imageConfig = normalizeImageConfig(input.modelId, input.imageConfig);

        await conversationsRepository.appendMessageToConversation({
            conversationId,
            messageId: assistantMessageId,
            messageRole: "assistant",
            messageParts: [],
            messageStatus: "pending",
            messageMetadata: {
                model: input.modelId,
                imageGeneration: true,
                generationStartedAt,
                ...(imageConfig ? { imageConfig } : {})
            }
        });

        try {
            const payload: Record<string, unknown> = {
                model: input.modelId,
                messages: [
                    {
                        role: "user",
                        content: toOpenRouterUserContent(latestUserMessage)
                    }
                ],
                modalities: modelConfig.modalities
            };

            if (imageConfig) {
                payload.image_config = imageConfig;
            }

            let response: Response;

            try {
                response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        Accept: "application/json"
                    },
                    body: JSON.stringify(payload)
                });
            } catch {
                throw new ConversationError(
                    502,
                    "Unable to reach OpenRouter for image generation right now."
                );
            }

            let responsePayload: unknown = null;

            try {
                responsePayload = await response.json();
            } catch {
                // ignore and use fallback errors below
            }

            if (!response.ok) {
                const message =
                    getErrorMessage(responsePayload) ??
                    "Image generation failed. Please try again.";

                throw new ConversationError(
                    response.status >= 500 ? 502 : 400,
                    message
                );
            }

            const root =
                responsePayload && typeof responsePayload === "object"
                    ? (responsePayload as Record<string, unknown>)
                    : null;

            const choices = Array.isArray(root?.choices)
                ? root.choices
                : ([] as unknown[]);
            const firstChoice =
                choices.length > 0 && choices[0] && typeof choices[0] === "object"
                    ? (choices[0] as Record<string, unknown>)
                    : null;
            const message =
                firstChoice?.message && typeof firstChoice.message === "object"
                    ? firstChoice.message
                    : null;

            const text = extractAssistantText(message);
            const imageParts = imagePartsFromUrls(extractImageUrls(message));

            if (imageParts.length === 0) {
                throw new ConversationError(
                    502,
                    "The model did not return an image. Please try another prompt or model."
                );
            }

            const finalParts: MessagePart[] = [];

            if (text) {
                finalParts.push({ type: "text", text });
            }

            for (const imagePart of imageParts) {
                finalParts.push(imagePart);
            }

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: finalParts,
                status: "complete",
                metadata: {
                    model: input.modelId,
                    imageGeneration: true,
                    generationStartedAt,
                    generationCompletedAt: new Date().toISOString(),
                    imageCount: imageParts.length,
                    ...(imageConfig ? { imageConfig } : {})
                }
            });

            logger.info("Image generation completed", {
                conversationId,
                messageId: assistantMessageId,
                modelId: input.modelId,
                imageCount: imageParts.length
            });

            return {
                messageId: assistantMessageId,
                imageCount: imageParts.length
            };
        } catch (error) {
            const message =
                error instanceof ConversationError
                    ? error.message
                    : "Image generation failed. Please try again.";

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: [],
                status: "failed",
                metadata: {
                    model: input.modelId,
                    imageGeneration: true,
                    generationStartedAt,
                    generationCompletedAt: new Date().toISOString(),
                    errorMessage: message,
                    ...(imageConfig ? { imageConfig } : {})
                }
            });

            throw error;
        }
    }
};
