import type { InferSelectModel } from "drizzle-orm";
import { conversationReads, conversations, messages } from "../../db/schema";
import { extractDocumentText } from "./document-parser";

export type ConversationRecord = InferSelectModel<typeof conversations>;
export type ConversationReadRecord = InferSelectModel<typeof conversationReads>;
export type MessageRecord = InferSelectModel<typeof messages>;

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "complete" | "failed";

export interface TextMessagePart {
    type: "text";
    text: string;
}

export interface ImageMessagePart {
    type: "image";
    data: string; // base64
    mimeType: string;
    filename?: string;
    size?: number;
}

export interface FileMessagePart {
    type: "file";
    data: string; // base64
    mimeType: string;
    filename?: string;
    size?: number;
    extractedText?: string | null;
}

export interface MessageAttachmentInput {
    data: string;
    mimeType: string;
    filename?: string;
    size?: number;
}

export interface ToolInvocationPart {
    type: "tool-invocation";
    toolInvocationId: string;
    toolName: string;
    args: Record<string, unknown>;
    state: "call" | "result" | "error";
    result?: unknown;
}

export interface ReasoningMessagePart {
    type: "reasoning";
    text: string;
}

export type MessagePart =
    | TextMessagePart
    | ImageMessagePart
    | FileMessagePart
    | ToolInvocationPart
    | ReasoningMessagePart;

const IMAGE_MIME_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml"
]);

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 255;
const DEFAULT_ATTACHMENT_BASENAME = "attachment";

export interface ConversationMessage {
    id: string;
    parentMessageId: string | null;
    role: MessageRole;
    parts: MessagePart[];
    status: MessageStatus;
    createdAt: string;
    metadata: Record<string, unknown> | null;
}

export interface ConversationSummary {
    id: string;
    title: string;
    titleSource: string;
    isFavorite: boolean;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string;
    lastMessagePreview: string;
    lastMessageRole: MessageRole | null;
    latestAssistantMessageId: string | null;
    lastReadAssistantMessageId: string | null;
    hasUnreadAssistantReply: boolean;
}

export interface ConversationDetail extends ConversationSummary {
    messages: ConversationMessage[];
}

export class ConversationError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "ConversationError";
        this.status = status;
    }
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function clampFilename(value: string | undefined, index: number): string {
    const normalized = value?.trim().replace(/[\\/]+/g, "-") || "";

    if (!normalized) {
        return `${DEFAULT_ATTACHMENT_BASENAME}-${index + 1}`;
    }

    return normalized.slice(0, MAX_FILENAME_LENGTH);
}

function summarizeAttachment(part: MessagePart): string | null {
    if (part.type === "image") {
        return part.filename ? `Image: ${part.filename}` : "Image attachment";
    }

    if (part.type === "file") {
        return part.filename ? `File: ${part.filename}` : "File attachment";
    }

    return null;
}

function getAttachmentSize(input: MessageAttachmentInput, data: string): number {
    const decoded = Buffer.from(data, "base64");

    if (decoded.byteLength === 0) {
        throw new ConversationError(400, "Attachment data is invalid.");
    }

    const size =
        typeof input.size === "number" && Number.isFinite(input.size)
            ? Math.max(Math.round(input.size), decoded.byteLength)
            : decoded.byteLength;

    if (size > MAX_ATTACHMENT_BYTES) {
        throw new ConversationError(400, "Attachments must be 20 MB or smaller.");
    }

    return size;
}

async function createAttachmentPart(
    attachment: MessageAttachmentInput,
    index: number
): Promise<ImageMessagePart | FileMessagePart> {
    const mimeType = attachment.mimeType.trim();

    if (!mimeType) {
        throw new ConversationError(400, "Attachment mime type is required.");
    }

    const size = getAttachmentSize(attachment, attachment.data);
    const filename = clampFilename(attachment.filename, index);

    if (IMAGE_MIME_TYPES.has(mimeType)) {
        return {
            type: "image",
            data: attachment.data,
            mimeType,
            filename,
            size
        };
    }

    const extractedText = await extractDocumentText(
        mimeType,
        Uint8Array.from(Buffer.from(attachment.data, "base64")),
        filename
    );

    return {
        type: "file",
        data: attachment.data,
        mimeType,
        filename,
        size,
        extractedText
    };
}

export function createConversationTitle(
    prompt: string,
    attachments?: MessageAttachmentInput[]
): string {
    const normalized = normalizeWhitespace(prompt);

    if (!normalized) {
        const attachmentSummary = attachments
            ?.map((attachment, index) => clampFilename(attachment.filename, index))
            .find(Boolean);

        return attachmentSummary || "Attachment conversation";
    }

    if (normalized.length <= 60) {
        return normalized;
    }

    return `${normalized.slice(0, 57).trimEnd()}...`;
}

export async function createMessageParts(
    content: string,
    attachments?: MessageAttachmentInput[]
): Promise<MessagePart[]> {
    const parts: MessagePart[] = [];
    const normalized = content.trim();

    if (normalized) {
        parts.push({ type: "text", text: normalized });
    }

    for (const [index, attachment] of (attachments ?? []).entries()) {
        parts.push(await createAttachmentPart(attachment, index));
    }

    if (parts.length === 0) {
        throw new ConversationError(400, "Message content is required.");
    }

    return parts;
}

/** @deprecated Use createMessageParts instead */
export async function createTextMessageParts(content: string): Promise<MessagePart[]> {
    return createMessageParts(content);
}

export function getMessagePreview(parts: MessagePart[]): string {
    const preview = normalizeWhitespace(
        parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(" ")
    );

    if (!preview) {
        const attachmentPreview = parts.map(summarizeAttachment).find(Boolean);
        return attachmentPreview ?? "";
    }

    if (preview.length <= 90) {
        return preview;
    }

    return `${preview.slice(0, 87).trimEnd()}...`;
}

export function toConversationMessage(
    message: MessageRecord
): ConversationMessage {
    return {
        id: message.id,
        parentMessageId: message.parentMessageId ?? null,
        role: message.role as MessageRole,
        parts: message.parts,
        status: message.status as MessageStatus,
        createdAt: message.createdAt.toISOString(),
        metadata: message.metadata ?? null
    };
}

export function toConversationSummary(input: {
    conversation: ConversationRecord;
    latestMessage: MessageRecord | null;
    latestAssistantMessage: MessageRecord | null;
    readState: ConversationReadRecord | null;
}): ConversationSummary {
    const { conversation, latestMessage, latestAssistantMessage, readState } =
        input;
    const lastReadAssistantMessageId =
        readState?.lastReadAssistantMessageId ?? null;
    const latestAssistantMessageId = latestAssistantMessage?.id ?? null;

    return {
        id: conversation.id,
        title: conversation.title,
        titleSource: conversation.titleSource,
        isFavorite: conversation.isFavorite,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        lastMessagePreview: latestMessage
            ? getMessagePreview(latestMessage.parts)
            : "",
        lastMessageRole: latestMessage
            ? (latestMessage.role as MessageRole)
            : null,
        latestAssistantMessageId,
        lastReadAssistantMessageId,
        hasUnreadAssistantReply:
            latestAssistantMessageId !== null &&
            latestAssistantMessageId !== lastReadAssistantMessageId
    };
}

export function toConversationDetail(input: {
    conversation: ConversationRecord;
    messages: MessageRecord[];
    readState: ConversationReadRecord | null;
}): ConversationDetail {
    const latestMessage = input.messages.at(-1) ?? null;
    const latestAssistantMessage =
        [...input.messages]
            .reverse()
            .find((message) => message.role === "assistant") ?? null;

    return {
        ...toConversationSummary({
            conversation: input.conversation,
            latestMessage,
            latestAssistantMessage,
            readState: input.readState
        }),
        messages: input.messages.map(toConversationMessage)
    };
}
