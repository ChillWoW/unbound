import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PropsWithChildren
} from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/use-auth";
import { chatApi } from "./api";
import { parseAIStream } from "./utils/parse-ai-stream";
import type {
    ChatModel,
    ConversationDetail,
    ConversationMessage,
    ConversationSummary,
    MessagePart
} from "./types";

function getSelectedModelStorageKey(userId: string) {
    return `unbound.chat.selected-model:${userId}`;
}

function readStoredSelectedModelId(userId: string): string | null {
    if (typeof window === "undefined") {
        return null;
    }

    return window.localStorage.getItem(getSelectedModelStorageKey(userId));
}

function writeStoredSelectedModelId(userId: string, modelId: string | null) {
    if (typeof window === "undefined") {
        return;
    }

    const key = getSelectedModelStorageKey(userId);

    if (!modelId) {
        window.localStorage.removeItem(key);
        return;
    }

    window.localStorage.setItem(key, modelId);
}

interface ChatContextValue {
    availableModels: ChatModel[];
    conversations: ConversationSummary[];
    conversationsError: string | null;
    createConversation: (prompt: string) => Promise<ConversationDetail>;
    getConversation: (conversationId: string) => ConversationDetail | undefined;
    getConversationError: (conversationId: string) => string | null;
    isConversationLoading: (conversationId: string) => boolean;
    isConversationSending: (conversationId: string) => boolean;
    isCreatingConversation: boolean;
    isLoadingConversations: boolean;
    isLoadingModels: boolean;
    loadConversation: (conversationId: string) => Promise<ConversationDetail>;
    loadConversations: () => Promise<void>;
    loadModels: () => Promise<void>;
    markConversationRead: (
        conversationId: string,
        assistantMessageId: string
    ) => Promise<void>;
    modelsError: string | null;
    selectedModelId: string | null;
    sendMessage: (
        conversationId: string,
        prompt: string
    ) => Promise<ConversationDetail>;
    setSelectedModelId: (modelId: string | null) => void;
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
    const { isAuthenticated, isLoading, user } = useAuth();
    const [availableModels, setAvailableModels] = useState<ChatModel[]>([]);
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
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [isLoadingConversations, setIsLoadingConversations] = useState(false);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [isCreatingConversation, setIsCreatingConversation] = useState(false);
    const [selectedModelId, setSelectedModelIdState] = useState<string | null>(
        null
    );
    const selectedModelIdRef = useRef<string | null>(null);

    useEffect(() => {
        selectedModelIdRef.current = selectedModelId;
    }, [selectedModelId]);

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

    const loadModels = useCallback(async () => {
        if (!isAuthenticated || !user) {
            setAvailableModels([]);
            setSelectedModelIdState(null);
            return;
        }

        setIsLoadingModels(true);
        setModelsError(null);

        try {
            const response = await chatApi.listModels();
            const storedModelId = readStoredSelectedModelId(user.id);
            const currentSelectedModelId = selectedModelIdRef.current;
            const nextSelectedModelId =
                currentSelectedModelId &&
                response.models.some(
                    (model) => model.id === currentSelectedModelId
                )
                    ? currentSelectedModelId
                    : storedModelId &&
                        response.models.some((model) => model.id === storedModelId)
                      ? storedModelId
                      : response.models[0]?.id ?? null;

            setAvailableModels(response.models);
            setSelectedModelIdState(nextSelectedModelId);
            writeStoredSelectedModelId(user.id, nextSelectedModelId);
        } catch (error) {
            setAvailableModels([]);
            setSelectedModelIdState(null);
            setModelsError(getErrorMessage(error));
            throw error;
        } finally {
            setIsLoadingModels(false);
        }
    }, [isAuthenticated, user]);

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
            setAvailableModels([]);
            setConversationsError(null);
            setIsLoadingModels(false);
            setModelsError(null);
            setSelectedModelIdState(null);
            return;
        }

        void loadConversations();
    }, [isAuthenticated, isLoading, loadConversations]);

    useEffect(() => {
        if (isLoading || !isAuthenticated) {
            return;
        }

        void loadModels().catch(() => undefined);
    }, [isAuthenticated, isLoading, loadModels]);

    const runGeneration = useCallback(
        async (conversationId: string, modelId: string) => {
            const optimisticId = `msg_optimistic_${Date.now()}`;
            const optimisticMessage: ConversationMessage = {
                id: optimisticId,
                role: "assistant",
                parts: [],
                status: "pending",
                createdAt: new Date().toISOString(),
                metadata: { model: modelId }
            };

            setConversationDetails((current) => {
                const existing = current[conversationId];
                if (!existing) return current;
                return {
                    ...current,
                    [conversationId]: {
                        ...existing,
                        messages: [...existing.messages, optimisticMessage]
                    }
                };
            });

            const streamResponse = await chatApi.generateResponse(
                conversationId,
                modelId
            );

            if (!streamResponse.ok) {
                let errorMessage = "Generation failed.";
                try {
                    const errorData = await streamResponse.json();
                    if (errorData?.message) errorMessage = errorData.message;
                } catch {
                    // use default
                }
                throw new Error(errorMessage);
            }

            let realMessageId = optimisticId;
            let accumulatedText = "";
            const toolParts: MessagePart[] = [];

            await parseAIStream(streamResponse, {
                onMessageStart(messageId) {
                    realMessageId = messageId;
                    setConversationDetails((current) => {
                        const existing = current[conversationId];
                        if (!existing) return current;
                        return {
                            ...current,
                            [conversationId]: {
                                ...existing,
                                messages: existing.messages.map((m) =>
                                    m.id === optimisticId
                                        ? { ...m, id: messageId }
                                        : m
                                )
                            }
                        };
                    });
                },
                onTextDelta(text) {
                    accumulatedText += text;
                    const currentText = accumulatedText;
                    setConversationDetails((current) => {
                        const existing = current[conversationId];
                        if (!existing) return current;
                        return {
                            ...current,
                            [conversationId]: {
                                ...existing,
                                messages: existing.messages.map((m) =>
                                    m.id === realMessageId
                                        ? {
                                              ...m,
                                              parts: [
                                                  {
                                                      type: "text" as const,
                                                      text: currentText
                                                  },
                                                  ...toolParts
                                              ]
                                          }
                                        : m
                                )
                            }
                        };
                    });
                },
                onToolCall(toolCall) {
                    toolParts.push({
                        type: "tool-invocation",
                        toolInvocationId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        args: toolCall.args,
                        state: "call"
                    });
                    const currentParts: MessagePart[] = [
                        ...(accumulatedText
                            ? [
                                  {
                                      type: "text" as const,
                                      text: accumulatedText
                                  }
                              ]
                            : []),
                        ...toolParts
                    ];
                    setConversationDetails((current) => {
                        const existing = current[conversationId];
                        if (!existing) return current;
                        return {
                            ...current,
                            [conversationId]: {
                                ...existing,
                                messages: existing.messages.map((m) =>
                                    m.id === realMessageId
                                        ? { ...m, parts: currentParts }
                                        : m
                                )
                            }
                        };
                    });
                },
                onToolResult(toolResult) {
                    const idx = toolParts.findIndex(
                        (p) =>
                            p.type === "tool-invocation" &&
                            p.toolInvocationId === toolResult.toolCallId
                    );
                    if (idx !== -1) {
                        toolParts[idx] = {
                            ...toolParts[idx],
                            state: "result",
                            result: toolResult.result
                        } as MessagePart;
                    }
                    const currentParts: MessagePart[] = [
                        ...(accumulatedText
                            ? [
                                  {
                                      type: "text" as const,
                                      text: accumulatedText
                                  }
                              ]
                            : []),
                        ...toolParts
                    ];
                    setConversationDetails((current) => {
                        const existing = current[conversationId];
                        if (!existing) return current;
                        return {
                            ...current,
                            [conversationId]: {
                                ...existing,
                                messages: existing.messages.map((m) =>
                                    m.id === realMessageId
                                        ? { ...m, parts: currentParts }
                                        : m
                                )
                            }
                        };
                    });
                },
                onError() {
                    setConversationDetails((current) => {
                        const existing = current[conversationId];
                        if (!existing) return current;
                        return {
                            ...current,
                            [conversationId]: {
                                ...existing,
                                messages: existing.messages.map((m) =>
                                    m.id === realMessageId
                                        ? { ...m, status: "failed" }
                                        : m
                                )
                            }
                        };
                    });
                }
            });

            const finalResponse =
                await chatApi.getConversation(conversationId);
            upsertConversation(finalResponse.conversation);
        },
        [upsertConversation]
    );

    const createConversation = useCallback(
        async (prompt: string) => {
            const modelId = selectedModelIdRef.current;

            if (!modelId) {
                throw new Error("No model selected.");
            }

            setIsCreatingConversation(true);

            try {
                const response = await chatApi.createConversation(prompt);
                upsertConversation(response.conversation);

                const conversationId = response.conversation.id;

                setConversationSending(conversationId, true);
                runGeneration(conversationId, modelId)
                    .catch(() => undefined)
                    .finally(() =>
                        setConversationSending(conversationId, false)
                    );

                return response.conversation;
            } catch (error) {
                throw new Error(getErrorMessage(error));
            } finally {
                setIsCreatingConversation(false);
            }
        },
        [runGeneration, setConversationSending, upsertConversation]
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
            const modelId = selectedModelIdRef.current;

            if (!modelId) {
                throw new Error("No model selected.");
            }

            setConversationSending(conversationId, true);

            try {
                const persistResponse = await chatApi.sendMessage(
                    conversationId,
                    prompt
                );
                upsertConversation(persistResponse.conversation);

                await runGeneration(conversationId, modelId);

                const finalConversation =
                    conversationDetails[conversationId];
                if (finalConversation) return finalConversation;

                const reloaded =
                    await chatApi.getConversation(conversationId);
                upsertConversation(reloaded.conversation);
                return reloaded.conversation;
            } catch (error) {
                throw new Error(getErrorMessage(error));
            } finally {
                setConversationSending(conversationId, false);
            }
        },
        [
            conversationDetails,
            runGeneration,
            setConversationSending,
            upsertConversation
        ]
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

    const setSelectedModelId = useCallback(
        (modelId: string | null) => {
            setSelectedModelIdState(modelId);

            if (!user) {
                return;
            }

            writeStoredSelectedModelId(user.id, modelId);
        },
        [user]
    );

    const value = useMemo<ChatContextValue>(
        () => ({
            availableModels,
            conversations,
            conversationsError,
            createConversation,
            getConversation,
            getConversationError,
            isConversationLoading,
            isConversationSending,
            isCreatingConversation,
            isLoadingConversations,
            isLoadingModels,
            loadConversation,
            loadConversations,
            loadModels,
            markConversationRead,
            modelsError,
            selectedModelId,
            sendMessage,
            setSelectedModelId
        }),
        [
            availableModels,
            conversations,
            conversationsError,
            createConversation,
            getConversation,
            getConversationError,
            isConversationLoading,
            isConversationSending,
            isCreatingConversation,
            isLoadingConversations,
            isLoadingModels,
            loadConversation,
            loadConversations,
            loadModels,
            markConversationRead,
            modelsError,
            selectedModelId,
            sendMessage,
            setSelectedModelId
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
