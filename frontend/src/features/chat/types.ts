export interface MessagePart {
    type: "text";
    text: string;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "complete" | "failed";

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

export interface ConversationsResponse {
    conversations: ConversationSummary[];
}

export interface ConversationResponse {
    conversation: ConversationDetail;
}

export interface ConversationReadResponse {
    success: boolean;
    conversationId: string;
    assistantMessageId: string;
}
