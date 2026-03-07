import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type PropsWithChildren
} from "react";
import { mockConversations, type Conversation } from "./mock-conversations";

interface ChatContextValue {
    conversations: Conversation[];
    createConversation: (prompt: string) => Conversation;
    getConversation: (conversationId: string) => Conversation | undefined;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function getConversationTitle(prompt: string) {
    const normalized = prompt.replace(/\s+/g, " ").trim();

    if (normalized.length <= 42) {
        return normalized;
    }

    return `${normalized.slice(0, 39).trimEnd()}...`;
}

function buildConversation(prompt: string): Conversation {
    const createdAt = Date.now();

    return {
        id: `local-${createdAt}`,
        title: getConversationTitle(prompt) || "New chat",
        updatedAt: createdAt,
        messages: [
            {
                role: "user",
                content: prompt
            }
        ]
    };
}

export function ChatProvider({ children }: PropsWithChildren) {
    const [conversations, setConversations] =
        useState<Conversation[]>(mockConversations);

    const createConversation = useCallback((prompt: string) => {
        const nextConversation = buildConversation(prompt);

        setConversations((current) => [nextConversation, ...current]);

        return nextConversation;
    }, []);

    const getConversation = useCallback(
        (conversationId: string) =>
            conversations.find(
                (conversation) => conversation.id === conversationId
            ),
        [conversations]
    );

    const value = useMemo<ChatContextValue>(
        () => ({
            conversations,
            createConversation,
            getConversation
        }),
        [conversations, createConversation, getConversation]
    );

    return (
        <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);

    if (!context) {
        throw new Error("useChat must be used within ChatProvider.");
    }

    return context;
}
