import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type PropsWithChildren
} from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/use-auth";
import { chatApi } from "./api";
import type { ConversationDetail, ConversationSummary } from "./types";

interface ChatContextValue {
    conversations: ConversationSummary[];
    conversationsError: string | null;
    createConversation: (prompt: string) => Promise<ConversationDetail>;
    getConversation: (conversationId: string) => ConversationDetail | undefined;
    getConversationError: (conversationId: string) => string | null;
    isConversationLoading: (conversationId: string) => boolean;
    isConversationSending: (conversationId: string) => boolean;
    isCreatingConversation: boolean;
    isLoadingConversations: boolean;
    loadConversation: (conversationId: string) => Promise<ConversationDetail>;
    loadConversations: () => Promise<void>;
    markConversationRead: (
        conversationId: string,
        assistantMessageId: string
    ) => Promise<void>;
    sendMessage: (
        conversationId: string,
        prompt: string
    ) => Promise<ConversationDetail>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function getErrorMessage(error: unknown): string {
    if (
        error instanceof ApiError &&
        typeof error.data === "object" &&
        error.data
    ) {
        const message = "message" in error.data ? error.data.message : null;

        if (typeof message === "string" && message.length > 0) {
            return message;
        }
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return "Something went wrong. Please try again.";
}

function sortConversations(items: ConversationSummary[]) {
    return [...items].sort(
        (left, right) =>
            new Date(right.lastMessageAt).getTime() -
            new Date(left.lastMessageAt).getTime()
    );
}

function toConversationSummary(
    conversation: ConversationDetail | ConversationSummary
): ConversationSummary {
    return {
        id: conversation.id,
        title: conversation.title,
        titleSource: conversation.titleSource,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview,
        lastMessageRole: conversation.lastMessageRole,
        latestAssistantMessageId: conversation.latestAssistantMessageId,
        lastReadAssistantMessageId: conversation.lastReadAssistantMessageId,
        hasUnreadAssistantReply: conversation.hasUnreadAssistantReply
    };
}

export function ChatProvider({ children }: PropsWithChildren) {
    const { isAuthenticated, isLoading } = useAuth();
    const [conversations, setConversations] = useState<ConversationSummary[]>(
        []
    );
    const [conversationDetails, setConversationDetails] = useState<
        Record<string, ConversationDetail>
    >({});
    const [conversationErrors, setConversationErrors] = useState<
        Record<string, string | null>
    >({});
    const [conversationLoadingState, setConversationLoadingState] = useState<
        Record<string, boolean>
    >({});
    const [conversationSendingState, setConversationSendingState] = useState<
        Record<string, boolean>
    >({});
    const [conversationsError, setConversationsError] = useState<string | null>(
        null
    );
    const [isLoadingConversations, setIsLoadingConversations] = useState(false);
    const [isCreatingConversation, setIsCreatingConversation] = useState(false);

    const upsertConversation = useCallback(
        (conversation: ConversationDetail | ConversationSummary) => {
            const summary = toConversationSummary(conversation);

            setConversations((current) => {
                const nextItems = current.filter(
                    (item) => item.id !== summary.id
                );
                nextItems.unshift(summary);
                return sortConversations(nextItems);
            });

            if ("messages" in conversation) {
                setConversationDetails((current) => ({
                    ...current,
                    [conversation.id]: conversation
                }));
            }
        },
        []
    );

    const setConversationLoading = useCallback(
        (conversationId: string, value: boolean) => {
            setConversationLoadingState((current) => ({
                ...current,
                [conversationId]: value
            }));
        },
        []
    );

    const setConversationSending = useCallback(
        (conversationId: string, value: boolean) => {
            setConversationSendingState((current) => ({
                ...current,
                [conversationId]: value
            }));
        },
        []
    );

    const loadConversations = useCallback(async () => {
        if (!isAuthenticated) {
            setConversations([]);
            return;
        }

        setIsLoadingConversations(true);
        setConversationsError(null);

        try {
            const response = await chatApi.listConversations();
            setConversations(sortConversations(response.conversations));
        } catch (error) {
            setConversationsError(getErrorMessage(error));
            throw error;
        } finally {
            setIsLoadingConversations(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isLoading) {
            return;
        }

        if (!isAuthenticated) {
            setConversations([]);
            setConversationDetails({});
            setConversationErrors({});
            setConversationLoadingState({});
            setConversationSendingState({});
            setConversationsError(null);
            return;
        }

        void loadConversations();
    }, [isAuthenticated, isLoading, loadConversations]);

    const createConversation = useCallback(
        async (prompt: string) => {
            setIsCreatingConversation(true);

            try {
                const response = await chatApi.createConversation(prompt);
                upsertConversation(response.conversation);
                return response.conversation;
            } catch (error) {
                throw new Error(getErrorMessage(error));
            } finally {
                setIsCreatingConversation(false);
            }
        },
        [upsertConversation]
    );

    const loadConversation = useCallback(
        async (conversationId: string) => {
            setConversationLoading(conversationId, true);
            setConversationErrors((current) => ({
                ...current,
                [conversationId]: null
            }));

            try {
                const response = await chatApi.getConversation(conversationId);
                upsertConversation(response.conversation);
                return response.conversation;
            } catch (error) {
                const message = getErrorMessage(error);
                setConversationErrors((current) => ({
                    ...current,
                    [conversationId]: message
                }));
                throw error;
            } finally {
                setConversationLoading(conversationId, false);
            }
        },
        [setConversationLoading, upsertConversation]
    );

    const getConversation = useCallback(
        (conversationId: string) => conversationDetails[conversationId],
        [conversationDetails]
    );

    const getConversationError = useCallback(
        (conversationId: string) => conversationErrors[conversationId] ?? null,
        [conversationErrors]
    );

    const isConversationLoading = useCallback(
        (conversationId: string) =>
            conversationLoadingState[conversationId] ?? false,
        [conversationLoadingState]
    );

    const isConversationSending = useCallback(
        (conversationId: string) =>
            conversationSendingState[conversationId] ?? false,
        [conversationSendingState]
    );

    const sendMessage = useCallback(
        async (conversationId: string, prompt: string) => {
            setConversationSending(conversationId, true);

            try {
                const response = await chatApi.sendMessage(
                    conversationId,
                    prompt
                );
                upsertConversation(response.conversation);
                return response.conversation;
            } catch (error) {
                throw new Error(getErrorMessage(error));
            } finally {
                setConversationSending(conversationId, false);
            }
        },
        [setConversationSending, upsertConversation]
    );

    const markConversationRead = useCallback(
        async (conversationId: string, assistantMessageId: string) => {
            await chatApi.markConversationRead(
                conversationId,
                assistantMessageId
            );

            setConversations((current) =>
                current.map((conversation) =>
                    conversation.id === conversationId
                        ? {
                              ...conversation,
                              hasUnreadAssistantReply: false,
                              lastReadAssistantMessageId: assistantMessageId
                          }
                        : conversation
                )
            );

            setConversationDetails((current) => {
                const conversation = current[conversationId];

                if (!conversation) {
                    return current;
                }

                return {
                    ...current,
                    [conversationId]: {
                        ...conversation,
                        hasUnreadAssistantReply: false,
                        lastReadAssistantMessageId: assistantMessageId
                    }
                };
            });
        },
        []
    );

    const value = useMemo<ChatContextValue>(
        () => ({
            conversations,
            conversationsError,
            createConversation,
            getConversation,
            getConversationError,
            isConversationLoading,
            isConversationSending,
            isCreatingConversation,
            isLoadingConversations,
            loadConversation,
            loadConversations,
            markConversationRead,
            sendMessage
        }),
        [
            conversations,
            conversationsError,
            createConversation,
            getConversation,
            getConversationError,
            isConversationLoading,
            isConversationSending,
            isCreatingConversation,
            isLoadingConversations,
            loadConversation,
            loadConversations,
            markConversationRead,
            sendMessage
        ]
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
