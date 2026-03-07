import type { InferSelectModel } from "drizzle-orm";
import { conversationReads, conversations, messages } from "../../db/schema";

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
}

export interface ToolInvocationPart {
    type: "tool-invocation";
    toolInvocationId: string;
    toolName: string;
    args: Record<string, unknown>;
    state: "call" | "result" | "error";
    result?: unknown;
}

export type MessagePart = TextMessagePart | ImageMessagePart | ToolInvocationPart;

export interface ConversationMessage {
    id: string;
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

export function createConversationTitle(prompt: string): string {
    const normalized = normalizeWhitespace(prompt);

    if (!normalized) {
        return "Image conversation";
    }

    if (normalized.length <= 60) {
        return normalized;
    }

    return `${normalized.slice(0, 57).trimEnd()}...`;
}

export function createMessageParts(
    content: string,
    attachments?: Array<{ data: string; mimeType: string }>
): MessagePart[] {
    const parts: MessagePart[] = [];
    const normalized = content.trim();

    if (normalized) {
        parts.push({ type: "text", text: normalized });
    }

    for (const att of attachments ?? []) {
        parts.push({ type: "image", data: att.data, mimeType: att.mimeType });
    }

    if (parts.length === 0) {
        throw new ConversationError(400, "Message content is required.");
    }

    return parts;
}

/** @deprecated Use createMessageParts instead */
export function createTextMessageParts(content: string): MessagePart[] {
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
        return "";
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
