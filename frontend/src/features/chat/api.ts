import api, { API_BASE_URL } from "@/lib/api";
import type {
    ConversationDeleteResponse,
    ConversationReadResponse,
    ConversationResponse,
    ConversationsResponse,
    MessageCreateResponse,
    ModelsResponse,
    TodoItem
} from "./types";

export const chatApi = {
    generateResponse(
        conversationId: string,
        modelId: string,
        provider: string,
        thinking: boolean,
        signal?: AbortSignal,
        replyToMessageId?: string
    ) {
        return fetch(
            `${API_BASE_URL}/api/conversations/${conversationId}/generate`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ modelId, provider, thinking, replyToMessageId }),
                signal
            }
        );
    },

    createConversation(content: string, attachments?: Array<{ data: string; mimeType: string }>) {
        return api.post<ConversationResponse>("/api/conversations", {
            body: { content, attachments }
        });
    },

    getConversation(conversationId: string) {
        return api.get<ConversationResponse>(
            `/api/conversations/${conversationId}`
        );
    },

    listConversations() {
        return api.get<ConversationsResponse>("/api/conversations");
    },

    listModels() {
        return api.get<ModelsResponse>("/api/models");
    },

    markConversationRead(conversationId: string, assistantMessageId: string) {
        return api.post<ConversationReadResponse>(
            `/api/conversations/${conversationId}/read`,
            {
                body: { assistantMessageId }
            }
        );
    },

    updateConversation(
        conversationId: string,
        input: { title?: string; isFavorite?: boolean }
    ) {
        return api.patch<ConversationResponse>(
            `/api/conversations/${conversationId}`,
            {
                body: input
            }
        );
    },

    deleteConversation(conversationId: string) {
        return api.delete<ConversationDeleteResponse>(
            `/api/conversations/${conversationId}`
        );
    },

    sendMessage(
        conversationId: string,
        content: string,
        attachments?: Array<{ data: string; mimeType: string }>,
        parentMessageId?: string
    ) {
        return api.post<MessageCreateResponse>(
            `/api/conversations/${conversationId}/messages`,
            {
                body: { content, attachments, parentMessageId }
            }
        );
    },

    editMessage(
        conversationId: string,
        messageId: string,
        content: string,
        attachments?: Array<{ data: string; mimeType: string }>
    ) {
        return api.post<MessageCreateResponse>(
            `/api/conversations/${conversationId}/messages/${messageId}/edit`,
            {
                body: { content, attachments }
            }
        );
    },

    subscribeToGeneration(conversationId: string, signal?: AbortSignal) {
        return fetch(
            `${API_BASE_URL}/api/conversations/${conversationId}/generation`,
            {
                method: "GET",
                credentials: "include",
                signal
            }
        );
    },

    stopGeneration(conversationId: string) {
        return api.delete<{ stopped: boolean }>(
            `/api/conversations/${conversationId}/generation`
        );
    },

    listTodos(conversationId: string) {
        return api.get<{ todos: TodoItem[] }>(
            `/api/conversations/${conversationId}/todos`
        );
    }
};
