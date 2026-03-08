export interface TextMessagePart {
    type: "text";
    text: string;
}

export interface ImageMessagePart {
    type: "image";
    data: string; // base64
    mimeType: string;
}

export interface FileMessagePart {
    type: "file";
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

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "complete" | "failed";

export interface MessageMetadata {
    sentAt?: string;
    model?: string;
    thinkingEnabled?: boolean;
    generationStartedAt?: string;
    generationCompletedAt?: string;
    errorMessage?: string;
    [key: string]: unknown;
}

export interface ConversationMessage {
    id: string;
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

export type { ProviderType } from "@/lib/provider-types";

export interface ChatModel {
    id: string;
    name: string;
    provider: string;
    source: ProviderType;
    description: string | null;
    contextLength: number | null;
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
