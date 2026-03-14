import { randomBytes } from "node:crypto";
import type { InferSelectModel } from "drizzle-orm";
import {
    conversationReads,
    conversations,
    messageAttachments,
    messages
} from "../../db/schema";
import { logger } from "../../lib/logger";
import { blobStorage } from "../attachments/blob-storage";
import { extractDocumentText } from "./document-parser";

export type ConversationRecord = InferSelectModel<typeof conversations>;
export type ConversationReadRecord = InferSelectModel<typeof conversationReads>;
export type MessageRecord = InferSelectModel<typeof messages>;
export type MessageAttachmentRecord = InferSelectModel<typeof messageAttachments>;

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "complete" | "failed";
export type MessageAttachmentKind = "image" | "file";

export interface TextMessagePart {
    type: "text";
    text: string;
}

export interface ImageMessagePart {
    type: "image";
    attachmentId: string;
    mimeType: string;
    filename?: string;
    size?: number;
    url?: string;
    downloadUrl?: string;
}

export interface FileMessagePart {
    type: "file";
    attachmentId: string;
    mimeType: string;
    filename?: string;
    size?: number;
    url?: string;
    downloadUrl?: string;
}

export interface MessageAttachmentInput {
    data: string;
    mimeType: string;
    filename?: string;
    size?: number;
}

export interface PreparedMessageAttachment {
    id: string;
    kind: MessageAttachmentKind;
    storageKey: string;
    mimeType: string;
    filename: string;
    size: number;
    sha256: string;
    extractedText?: string | null;
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
    "image/svg+xml",
    "image/bmp",
    "image/x-icon",
    "image/avif"
]);

const EXTENSION_MIME_TYPES: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    ico: "image/x-icon",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp"
};

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;
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

export interface PreparedMessagePayload {
    parts: MessagePart[];
    attachments: PreparedMessageAttachment[];
}

export class ConversationError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "ConversationError";
        this.status = status;
    }
}

function createAttachmentId(): string {
    return `att_${randomBytes(10).toString("hex")}`;
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

function getFileExtension(filename: string | undefined): string | null {
    const normalized = filename?.trim().toLowerCase() ?? "";
    const lastDot = normalized.lastIndexOf(".");

    if (lastDot <= 0 || lastDot === normalized.length - 1) {
        return null;
    }

    return normalized.slice(lastDot + 1);
}

function normalizeMimeType(value: string | undefined): string {
    return value?.trim().toLowerCase() ?? "";
}

function resolveAttachmentMimeType(input: MessageAttachmentInput): string {
    const mimeType = normalizeMimeType(input.mimeType);

    if (mimeType) {
        return mimeType;
    }

    const extension = getFileExtension(input.filename);
    return extension ? EXTENSION_MIME_TYPES[extension] ?? "application/octet-stream" : "application/octet-stream";
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
    if (data.length > MAX_ATTACHMENT_BASE64_LENGTH) {
        throw new ConversationError(400, "Attachments must be 20 MB or smaller.");
    }

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

async function prepareAttachment(
    attachment: MessageAttachmentInput,
    index: number
): Promise<{
    part: ImageMessagePart | FileMessagePart;
    record: PreparedMessageAttachment;
}> {
    const mimeType = resolveAttachmentMimeType(attachment);

    const attachmentId = createAttachmentId();
    const size = getAttachmentSize(attachment, attachment.data);
    const filename = clampFilename(attachment.filename, index);
    const stored = await blobStorage.saveBase64({
        data: attachment.data,
        attachmentId
    });

    if (IMAGE_MIME_TYPES.has(mimeType)) {
        return {
            part: {
                type: "image",
                attachmentId,
                mimeType,
                filename,
                size
            },
            record: {
                id: attachmentId,
                kind: "image",
                storageKey: stored.storageKey,
                mimeType,
                filename,
                size,
                sha256: stored.sha256
            }
        };
    }

    const extractedText = await extractDocumentText(
        mimeType,
        Uint8Array.from(Buffer.from(attachment.data, "base64")),
        filename
    );

    return {
        part: {
            type: "file",
            attachmentId,
            mimeType,
            filename,
            size
        },
        record: {
            id: attachmentId,
            kind: "file",
            storageKey: stored.storageKey,
            mimeType,
            filename,
            size,
            sha256: stored.sha256,
            extractedText
        }
    };
}

function hydrateAttachmentPart(
    part: ImageMessagePart | FileMessagePart,
    attachmentMap: Map<string, MessageAttachmentRecord>
): ImageMessagePart | FileMessagePart {
    const attachment = attachmentMap.get(part.attachmentId);

    if (!attachment) {
        return part;
    }

    return {
        ...part,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
        size: attachment.size,
        url: blobStorage.resolvePublicPath(attachment.id, false),
        downloadUrl: blobStorage.resolvePublicPath(attachment.id, true)
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

export async function prepareMessagePayload(
    content: string,
    attachments?: MessageAttachmentInput[]
): Promise<PreparedMessagePayload> {
    const startedAt = Date.now();
    const parts: MessagePart[] = [];
    const preparedAttachments: PreparedMessageAttachment[] = [];
    const normalized = content.trim();

    if (normalized) {
        parts.push({ type: "text", text: normalized });
    }

    const attachmentInputs = attachments ?? [];

    for (const [index, attachment] of attachmentInputs.entries()) {
        const prepared = await prepareAttachment(attachment, index);
        parts.push(prepared.part);
        preparedAttachments.push(prepared.record);
    }

    if (parts.length === 0) {
        throw new ConversationError(400, "Message content is required.");
    }

    if (preparedAttachments.length > 0) {
        logger.info("Message attachments prepared", {
            attachmentCount: preparedAttachments.length,
            storageRoot: blobStorage.rootPath(),
            durationMs: Date.now() - startedAt
        });
    }

    return {
        parts,
        attachments: preparedAttachments
    };
}

/** @deprecated Use prepareMessagePayload instead */
export async function createTextMessageParts(content: string): Promise<MessagePart[]> {
    const payload = await prepareMessagePayload(content);
    return payload.parts;
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
    message: MessageRecord,
    attachmentMap: Map<string, MessageAttachmentRecord>
): ConversationMessage {
    return {
        id: message.id,
        parentMessageId: message.parentMessageId ?? null,
        role: message.role as MessageRole,
        parts: (message.parts as MessagePart[]).map((part) => {
            if (part.type === "image" || part.type === "file") {
                return hydrateAttachmentPart(part, attachmentMap);
            }

            return part;
        }),
        status: message.status as MessageStatus,
        createdAt: message.createdAt.toISOString(),
        metadata: message.metadata ?? null
    };
}

export function toConversationSummary(input: {
    conversation: ConversationRecord;
    readState: ConversationReadRecord | null;
}): ConversationSummary {
    const { conversation, readState } = input;
    const lastReadAssistantMessageId =
        readState?.lastReadAssistantMessageId ?? null;
    const latestAssistantMessageId = conversation.latestAssistantMessageId ?? null;

    return {
        id: conversation.id,
        title: conversation.title,
        titleSource: conversation.titleSource,
        isFavorite: conversation.isFavorite,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        lastMessagePreview: conversation.lastMessagePreview,
        lastMessageRole: (conversation.lastMessageRole as MessageRole | null) ?? null,
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
    attachments: MessageAttachmentRecord[];
    readState: ConversationReadRecord | null;
}): ConversationDetail {
    const attachmentMap = new Map(
        input.attachments.map((attachment) => [attachment.id, attachment])
    );

    return {
        ...toConversationSummary({
            conversation: input.conversation,
            readState: input.readState
        }),
        messages: input.messages.map((message) =>
            toConversationMessage(message, attachmentMap)
        )
    };
}
