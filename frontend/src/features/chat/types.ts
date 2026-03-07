export interface TextMessagePart {
    type: "text";
    text: string;
}

export interface ToolInvocationPart {
    type: "tool-invocation";
    toolInvocationId: string;
    toolName: string;
    args: Record<string, unknown>;
    state: "call" | "result" | "error";
    result?: unknown;
}

export type MessagePart = TextMessagePart | ToolInvocationPart;

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "complete" | "failed";

export interface MessageMetadata {
    model?: string;
    generationStartedAt?: string;
    generationCompletedAt?: string;
    [key: string]: unknown;
}

export interface ConversationMessage {
    id: string;
    role: MessageRole;
    parts: MessagePart[];
    status: MessageStatus;
    createdAt: string;
    metadata: MessageMetadata | null;
}

export interface ConversationSummary {
    id: string;
    title: string;
    titleSource: string;
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

export interface ChatModel {
    id: string;
    name: string;
    provider: string;
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
}

export interface ConversationResponse {
    conversation: ConversationDetail;
}

export interface ConversationReadResponse {
    success: boolean;
    conversationId: string;
    assistantMessageId: string;
}
