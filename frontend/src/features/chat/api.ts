import api from "@/lib/api";
import type {
    ConversationReadResponse,
    ConversationResponse,
    ConversationsResponse,
    ModelsResponse
} from "./types";

export const chatApi = {
    createConversation(content: string) {
        return api.post<ConversationResponse>("/api/conversations", {
            body: { content }
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

    sendMessage(conversationId: string, content: string) {
        return api.post<ConversationResponse>(
            `/api/conversations/${conversationId}/messages`,
            {
                body: { content }
            }
        );
    }
};
