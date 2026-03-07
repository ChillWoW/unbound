import api, { API_BASE_URL } from "@/lib/api";
import type {
    ConversationReadResponse,
    ConversationResponse,
    ConversationsResponse,
    ModelsResponse
} from "./types";

export const chatApi = {
    generateResponse(conversationId: string, modelId: string, signal?: AbortSignal) {
        return fetch(
            `${API_BASE_URL}/api/conversations/${conversationId}/generate`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ modelId }),
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

    sendMessage(conversationId: string, content: string, attachments?: Array<{ data: string; mimeType: string }>) {
        return api.post<ConversationResponse>(
            `/api/conversations/${conversationId}/messages`,
            {
                body: { content, attachments }
            }
        );
    }
};
