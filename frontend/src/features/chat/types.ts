import type { ProviderType } from "@/lib/provider-types";

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

export interface AttachmentPayload {
    data: string;
    mimeType: string;
    filename?: string;
    size?: number;
}

export interface CitationSource {
    id: string;
    title: string;
    url: string;
    host: string;
    snippet?: string;
    sourceType: "web" | "document";
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

export type ChatRecoveryCode =
    | "missing_api_key"
    | "invalid_api_key"
    | "rate_limited"
    | "insufficient_quota"
    | "model_unavailable"
    | "unsupported_input"
    | "context_length_exceeded"
    | "request_timeout"
    | "network_error";

export type ChatRecoveryAction = "open_settings" | "switch_model" | "retry";

export interface ChatErrorRecovery {
    code: ChatRecoveryCode;
    action: ChatRecoveryAction;
    message: string;
    provider?: ProviderType;
    retryable: boolean;
}

export type MessagePart =
    | TextMessagePart
    | ImageMessagePart
    | FileMessagePart
    | ToolInvocationPart
    | ReasoningMessagePart;

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "complete" | "failed";

export interface MessageMetadata {
    sentAt?: string;
    model?: string;
    provider?: string;
    thinkingEnabled?: boolean;
    deepResearch?: boolean;
    generationStartedAt?: string;
    generationCompletedAt?: string;
    errorMessage?: string;
    errorRecovery?: ChatErrorRecovery | null;
    sources?: CitationSource[];
    [key: string]: unknown;
}

export interface ConversationMessage {
    id: string;
    parentMessageId: string | null;
    role: MessageRole;
    parts: MessagePart[];
    status: MessageStatus;
    errorMessage?: string;
    createdAt: string;
    metadata: MessageMetadata | null;
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

export type { ProviderType };

export interface ChatModel {
    id: string;
    name: string;
    provider: string;
    source: ProviderType;
    description: string | null;
    contextLength: number | null;
    maxOutputTokens: number | null;
    promptPricing: string | null;
    completionPricing: string | null;
    inputModalities: string[];
    outputModalities: string[];
    free?: boolean;
}

export interface ConversationsResponse {
    conversations: ConversationSummary[];
}

export interface ModelsResponse {
    models: ChatModel[];
    configuredProviders: ProviderType[];
}

export interface ConversationResponse {
    conversation: ConversationDetail;
}

export interface ConversationDeleteResponse {
    success: boolean;
    conversationId: string;
}

export interface MessageCreateResponse extends ConversationResponse {
    newMessageId: string;
}

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TodoPriority = "low" | "medium" | "high";

export interface TodoItem {
    id: string;
    content: string;
    status: TodoStatus;
    priority: TodoPriority;
    position: number;
    createdAt: string;
    updatedAt: string;
}

export interface ConversationReadResponse {
    success: boolean;
    conversationId: string;
    assistantMessageId: string;
}
