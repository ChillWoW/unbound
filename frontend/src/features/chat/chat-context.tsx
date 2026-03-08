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
import { parseAIStream, type ReconnectState } from "./utils/parse-ai-stream";
import type { ChatAttachment } from "./components/chat-input";
import type {
    ChatModel,
    ConversationDetail,
    ConversationMessage,
    ConversationSummary,
    MessagePart,
    TodoItem,
    ToolInvocationPart
} from "./types";

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function prepareAttachments(attachments: ChatAttachment[]) {
    return Promise.all(
        attachments.map(async (a) => ({
            data: await fileToBase64(a.file),
            mimeType: a.file.type
        }))
    );
}

function getSelectedModelStorageKey(userId: string) {
    return `unbound.chat.selected-model:${userId}`;
}

function getPartialMessageStorageKey(messageId: string) {
    return `unbound.chat.partial-message:${messageId}`;
}

function savePartialMessage(messageId: string, parts: MessagePart[]) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            getPartialMessageStorageKey(messageId),
            JSON.stringify(parts)
        );
    } catch {
        // ignore storage errors
    }
}

function loadPartialMessage(messageId: string): MessagePart[] | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(
            getPartialMessageStorageKey(messageId)
        );
        return raw ? (JSON.parse(raw) as MessagePart[]) : null;
    } catch {
        return null;
    }
}

function clearPartialMessage(messageId: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(getPartialMessageStorageKey(messageId));
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
    createConversation: (
        prompt: string,
        attachments?: ChatAttachment[]
    ) => Promise<ConversationDetail>;
    deleteConversation: (conversationId: string) => Promise<void>;
    getConversation: (conversationId: string) => ConversationDetail | undefined;
    getConversationError: (conversationId: string) => string | null;
    getConversationTodos: (conversationId: string) => TodoItem[];
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
    renameConversation: (
        conversationId: string,
        title: string
    ) => Promise<void>;
    reconnectToGeneration: (conversationId: string) => Promise<void>;
    isThinkingEnabled: boolean;
    selectedModelId: string | null;
    sendMessage: (
        conversationId: string,
        prompt: string,
        attachments?: ChatAttachment[]
    ) => Promise<ConversationDetail>;
    setSelectedModelId: (modelId: string | null) => void;
    setThinkingEnabled: (enabled: boolean) => void;
    stopGeneration: (conversationId: string) => void;
    toggleFavoriteConversation: (
        conversationId: string,
        isFavorite: boolean
    ) => Promise<void>;
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
    return [...items].sort((left, right) => {
        if (left.isFavorite !== right.isFavorite) {
            return left.isFavorite ? -1 : 1;
        }

        return (
            new Date(right.lastMessageAt).getTime() -
            new Date(left.lastMessageAt).getTime()
        );
    });
}

function toConversationSummary(
    conversation: ConversationDetail | ConversationSummary
): ConversationSummary {
    return {
        id: conversation.id,
        title: conversation.title,
        titleSource: conversation.titleSource,
        isFavorite: conversation.isFavorite,
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

function extractTodosFromToolResult(
    toolName: string,
    result: unknown
): TodoItem[] | null {
    if (!toolName.startsWith("todo")) return null;
    if (
        typeof result === "object" &&
        result !== null &&
        "todos" in result &&
        Array.isArray((result as Record<string, unknown>).todos)
    ) {
        return (result as { todos: TodoItem[] }).todos;
    }
    return null;
}

function upsertToolInvocationPart(
    parts: MessagePart[],
    incoming: ToolInvocationPart
) {
    const idx = parts.findIndex(
        (p) =>
            p.type === "tool-invocation" &&
            p.toolInvocationId === incoming.toolInvocationId
    );

    if (idx === -1) {
        parts.push(incoming);
        return;
    }

    const existing = parts[idx] as ToolInvocationPart;

    if (
        incoming.state === "call" &&
        (existing.state === "result" || existing.state === "error")
    ) {
        parts[idx] = {
            ...existing,
            toolName: incoming.toolName,
            args: incoming.args
        };
        return;
    }

    parts[idx] = {
        ...existing,
        ...incoming,
        result: incoming.state === "result" ? incoming.result : undefined
    };
}

function applyToolResult(
    parts: MessagePart[],
    toolResult: { toolCallId: string; toolName: string; result: unknown }
) {
    upsertToolInvocationPart(parts, {
        type: "tool-invocation",
        toolInvocationId: toolResult.toolCallId,
        toolName: toolResult.toolName,
        args: {},
        state: "result",
        result: toolResult.result
    });
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
    const [conversationTodos, setConversationTodos] = useState<
        Record<string, TodoItem[]>
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
    const [isThinkingEnabled, setIsThinkingEnabled] = useState(
        () => localStorage.getItem("thinking-enabled") === "true"
    );
    const isThinkingEnabledRef = useRef(false);
    const activeGenerationsRef = useRef<Map<string, AbortController>>(
        new Map()
    );

    useEffect(() => {
        selectedModelIdRef.current = selectedModelId;
    }, [selectedModelId]);

    useEffect(() => {
        isThinkingEnabledRef.current = isThinkingEnabled;
        localStorage.setItem("thinking-enabled", String(isThinkingEnabled));
    }, [isThinkingEnabled]);

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
                const hydratedMessages = conversation.messages.map((m) => {
                    if (m.role !== "assistant" || m.parts.length > 0) return m;
                    const saved = loadPartialMessage(m.id);
                    if (!saved) return m;
                    return { ...m, status: "complete" as const, parts: saved };
                });
                setConversationDetails((current) => ({
                    ...current,
                    [conversation.id]: {
                        ...conversation,
                        messages: hydratedMessages
                    }
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
        setIsLoadingModels(true);
        setModelsError(null);

        try {
            const response = await chatApi.listModels();
            const storedModelId = user
                ? readStoredSelectedModelId(user.id)
                : null;
            const currentSelectedModelId = selectedModelIdRef.current;
            const nextSelectedModelId =
                currentSelectedModelId &&
                response.models.some(
                    (model) => model.id === currentSelectedModelId
                )
                    ? currentSelectedModelId
                    : storedModelId &&
                        response.models.some(
                            (model) => model.id === storedModelId
                        )
                      ? storedModelId
                      : (response.models[0]?.id ?? null);

            setAvailableModels(response.models);
            setSelectedModelIdState(nextSelectedModelId);
            if (user) writeStoredSelectedModelId(user.id, nextSelectedModelId);
        } catch (error) {
            setAvailableModels([]);
            setSelectedModelIdState(null);
            setModelsError(getErrorMessage(error));
            throw error;
        } finally {
            setIsLoadingModels(false);
        }
    }, [user]);

    useEffect(() => {
        if (isLoading) {
            return;
        }

        if (!isAuthenticated) {
            setConversations([]);
            setConversationDetails({});
            setConversationTodos({});
            setConversationErrors({});
            setConversationLoadingState({});
            setConversationSendingState({});
            setConversationsError(null);
            return;
        }

        void loadConversations();
    }, [isAuthenticated, isLoading, loadConversations]);

    useEffect(() => {
        if (isLoading) {
            return;
        }

        void loadModels().catch(() => undefined);
    }, [isLoading, loadModels]);

    const stopGeneration = useCallback((conversationId: string) => {
        const controller = activeGenerationsRef.current.get(conversationId);
        if (controller) {
            controller.abort();
            activeGenerationsRef.current.delete(conversationId);
        }
        void chatApi.stopGeneration(conversationId).catch(() => {});
    }, []);

    const runGeneration = useCallback(
        async (conversationId: string, modelId: string) => {
            const thinking = isThinkingEnabledRef.current;
            const abortController = new AbortController();
            activeGenerationsRef.current.set(conversationId, abortController);

            const optimisticId = `msg_optimistic_${Date.now()}`;
            const optimisticMessage: ConversationMessage = {
                id: optimisticId,
                role: "assistant",
                parts: [],
                status: "pending",
                createdAt: new Date().toISOString(),
                metadata: { model: modelId, thinkingEnabled: thinking }
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

            let streamResponse: Response;
            try {
                streamResponse = await chatApi.generateResponse(
                    conversationId,
                    modelId,
                    thinking,
                    abortController.signal
                );
            } catch (error) {
                activeGenerationsRef.current.delete(conversationId);
                if (error instanceof Error && error.name === "AbortError")
                    return;
                throw error;
            }

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
            const streamParts: MessagePart[] = [];

            const buildParts = (): MessagePart[] => [...streamParts];

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
                onReasoning(text) {
                    const lastPart = streamParts[streamParts.length - 1];
                    if (lastPart?.type === "reasoning") {
                        streamParts[streamParts.length - 1] = { type: "reasoning", text: lastPart.text + text };
                    } else {
                        streamParts.push({ type: "reasoning", text });
                    }
                    const currentParts = buildParts();
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
                onTextDelta(text) {
                    const lastPart = streamParts[streamParts.length - 1];
                    if (lastPart?.type === "text") {
                        streamParts[streamParts.length - 1] = { type: "text", text: lastPart.text + text };
                    } else {
                        streamParts.push({ type: "text", text });
                    }
                    const currentParts = buildParts();
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
                onToolCall(toolCall) {
                    upsertToolInvocationPart(streamParts, {
                        type: "tool-invocation",
                        toolInvocationId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        args: toolCall.args,
                        state: "call"
                    });
                    const currentParts = buildParts();
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
                    applyToolResult(streamParts, toolResult);
                    const currentParts = buildParts();
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

                    const todos = extractTodosFromToolResult(
                        toolResult.toolName,
                        toolResult.result
                    );
                    if (todos) {
                        setConversationTodos((current) => ({
                            ...current,
                            [conversationId]: todos
                        }));
                    }
                },
                onError(error) {
                    if (abortController.signal.aborted) return;
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
                                              status: "failed",
                                              errorMessage: error
                                          }
                                        : m
                                )
                            }
                        };
                    });
                }
            }).catch((error: unknown) => {
                if (!(error instanceof Error && error.name === "AbortError")) {
                    throw error;
                }
            });

            activeGenerationsRef.current.delete(conversationId);

            // Resolve any tools still in "call" state — they'll never get a result
            for (let i = 0; i < streamParts.length; i++) {
                const p = streamParts[i];
                if (p.type === "tool-invocation" && p.state === "call") {
                    streamParts[i] = { ...p, state: "error" };
                }
            }

            if (abortController.signal.aborted) {
                const stoppedParts = buildParts();
                savePartialMessage(realMessageId, stoppedParts);
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
                                          status: "complete",
                                          parts: stoppedParts
                                      }
                                    : m
                            )
                        }
                    };
                });
                return;
            }

            const finalResponse = await chatApi.getConversation(conversationId);
            // Clear any stale partial save now that generation completed normally
            clearPartialMessage(
                finalResponse.conversation.latestAssistantMessageId ?? ""
            );
            upsertConversation(finalResponse.conversation);
        },
        [upsertConversation]
    );

    const reconnectToGeneration = useCallback(
        async (conversationId: string) => {
            if (activeGenerationsRef.current.has(conversationId)) return;

            const abortController = new AbortController();
            activeGenerationsRef.current.set(conversationId, abortController);
            setConversationSending(conversationId, true);

            try {
                const response = await chatApi.subscribeToGeneration(
                    conversationId,
                    abortController.signal
                );

                const contentType = response.headers.get("content-type") ?? "";

                if (!contentType.includes("text/event-stream")) {
                    activeGenerationsRef.current.delete(conversationId);
                    setConversationSending(conversationId, false);
                    const reloaded =
                        await chatApi.getConversation(conversationId);
                    upsertConversation(reloaded.conversation);
                    return;
                }

                const realMessageId =
                    response.headers.get("x-message-id") ?? "";
                let accumulatedText = "";
                let accumulatedReasoning = "";
                const toolParts: MessagePart[] = [];

                const buildParts = (): MessagePart[] => [
                    ...(accumulatedReasoning ? [{ type: "reasoning" as const, text: accumulatedReasoning }] : []),
                    ...(accumulatedText ? [{ type: "text" as const, text: accumulatedText }] : []),
                    ...toolParts
                ];

                await parseAIStream(response, {
                    onMessageStart(messageId) {
                        setConversationDetails((current) => {
                            const existing = current[conversationId];
                            if (!existing) return current;
                            const hasMessage = existing.messages.some(
                                (m) => m.id === messageId
                            );
                            if (hasMessage) {
                                return {
                                    ...current,
                                    [conversationId]: {
                                        ...existing,
                                        messages: existing.messages.map((m) =>
                                            m.id === messageId
                                                ? {
                                                      ...m,
                                                      status: "pending" as const
                                                  }
                                                : m
                                        )
                                    }
                                };
                            }
                            return current;
                        });
                    },
                    onReconnectState(state: ReconnectState) {
                        accumulatedText = state.text;
                        accumulatedReasoning = state.reasoning || "";
                        toolParts.length = 0;
                        for (const tp of state.toolParts) {
                            upsertToolInvocationPart(toolParts, tp);
                        }
                        const currentParts = buildParts();
                        const mid = realMessageId;
                        setConversationDetails((current) => {
                            const existing = current[conversationId];
                            if (!existing) return current;
                            return {
                                ...current,
                                [conversationId]: {
                                    ...existing,
                                    messages: existing.messages.map((m) =>
                                        m.id === mid
                                            ? { ...m, parts: currentParts }
                                            : m
                                    )
                                }
                            };
                        });
                    },
                    onReasoning(text) {
                        accumulatedReasoning += text;
                        const currentParts = buildParts();
                        const mid = realMessageId;
                        setConversationDetails((current) => {
                            const existing = current[conversationId];
                            if (!existing) return current;
                            return {
                                ...current,
                                [conversationId]: {
                                    ...existing,
                                    messages: existing.messages.map((m) =>
                                        m.id === mid
                                            ? { ...m, parts: currentParts }
                                            : m
                                    )
                                }
                            };
                        });
                    },
                    onTextDelta(text) {
                        accumulatedText += text;
                        const currentParts = buildParts();
                        const mid = realMessageId;
                        setConversationDetails((current) => {
                            const existing = current[conversationId];
                            if (!existing) return current;
                            return {
                                ...current,
                                [conversationId]: {
                                    ...existing,
                                    messages: existing.messages.map((m) =>
                                        m.id === mid
                                            ? { ...m, parts: currentParts }
                                            : m
                                    )
                                }
                            };
                        });
                    },
                    onToolCall(toolCall) {
                        upsertToolInvocationPart(toolParts, {
                            type: "tool-invocation",
                            toolInvocationId: toolCall.toolCallId,
                            toolName: toolCall.toolName,
                            args: toolCall.args,
                            state: "call"
                        });
                        const currentParts = buildParts();
                        const mid = realMessageId;
                        setConversationDetails((current) => {
                            const existing = current[conversationId];
                            if (!existing) return current;
                            return {
                                ...current,
                                [conversationId]: {
                                    ...existing,
                                    messages: existing.messages.map((m) =>
                                        m.id === mid
                                            ? { ...m, parts: currentParts }
                                            : m
                                    )
                                }
                            };
                        });
                    },
                    onToolResult(toolResult) {
                        applyToolResult(toolParts, toolResult);
                        const currentParts = buildParts();
                        const mid = realMessageId;
                        setConversationDetails((current) => {
                            const existing = current[conversationId];
                            if (!existing) return current;
                            return {
                                ...current,
                                [conversationId]: {
                                    ...existing,
                                    messages: existing.messages.map((m) =>
                                        m.id === mid
                                            ? { ...m, parts: currentParts }
                                            : m
                                    )
                                }
                            };
                        });

                        const todos = extractTodosFromToolResult(
                            toolResult.toolName,
                            toolResult.result
                        );
                        if (todos) {
                            setConversationTodos((current) => ({
                                ...current,
                                [conversationId]: todos
                            }));
                        }
                    },
                    onError() {
                        if (abortController.signal.aborted) return;
                        const mid = realMessageId;
                        setConversationDetails((current) => {
                            const existing = current[conversationId];
                            if (!existing) return current;
                            return {
                                ...current,
                                [conversationId]: {
                                    ...existing,
                                    messages: existing.messages.map((m) =>
                                        m.id === mid
                                            ? { ...m, status: "failed" }
                                            : m
                                    )
                                }
                            };
                        });
                    }
                }).catch((error: unknown) => {
                    if (
                        !(error instanceof Error && error.name === "AbortError")
                    ) {
                        throw error;
                    }
                });

                activeGenerationsRef.current.delete(conversationId);

                if (!abortController.signal.aborted) {
                    const finalResponse =
                        await chatApi.getConversation(conversationId);
                    upsertConversation(finalResponse.conversation);
                }
            } catch {
                // reconnection is best-effort
            } finally {
                activeGenerationsRef.current.delete(conversationId);
                setConversationSending(conversationId, false);
            }
        },
        [setConversationSending, upsertConversation]
    );

    const createConversation = useCallback(
        async (prompt: string, attachments?: ChatAttachment[]) => {
            const modelId = selectedModelIdRef.current;

            if (!modelId) {
                throw new Error("No model selected.");
            }

            setIsCreatingConversation(true);

            try {
                const preparedAttachments = attachments?.length
                    ? await prepareAttachments(attachments)
                    : undefined;
                const response = await chatApi.createConversation(
                    prompt,
                    preparedAttachments
                );
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
                const [response, todosResponse] = await Promise.all([
                    chatApi.getConversation(conversationId),
                    chatApi.listTodos(conversationId).catch(() => ({ todos: [] as TodoItem[] }))
                ]);
                upsertConversation(response.conversation);
                setConversationTodos((current) => ({
                    ...current,
                    [conversationId]: todosResponse.todos
                }));
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

    const getConversationTodos = useCallback(
        (conversationId: string) => conversationTodos[conversationId] ?? [],
        [conversationTodos]
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
        async (
            conversationId: string,
            prompt: string,
            attachments?: ChatAttachment[]
        ) => {
            const modelId = selectedModelIdRef.current;

            if (!modelId) {
                throw new Error("No model selected.");
            }

            setConversationSending(conversationId, true);

            try {
                const preparedAttachments = attachments?.length
                    ? await prepareAttachments(attachments)
                    : undefined;
                const persistResponse = await chatApi.sendMessage(
                    conversationId,
                    prompt,
                    preparedAttachments
                );
                upsertConversation(persistResponse.conversation);

                await runGeneration(conversationId, modelId);

                const finalConversation = conversationDetails[conversationId];
                if (finalConversation) return finalConversation;

                const reloaded = await chatApi.getConversation(conversationId);
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

    const renameConversation = useCallback(
        async (conversationId: string, title: string) => {
            try {
                const response = await chatApi.updateConversation(
                    conversationId,
                    {
                        title
                    }
                );
                upsertConversation(response.conversation);
            } catch (error) {
                throw new Error(getErrorMessage(error));
            }
        },
        [upsertConversation]
    );

    const toggleFavoriteConversation = useCallback(
        async (conversationId: string, isFavorite: boolean) => {
            try {
                const response = await chatApi.updateConversation(
                    conversationId,
                    {
                        isFavorite
                    }
                );
                upsertConversation(response.conversation);
            } catch (error) {
                throw new Error(getErrorMessage(error));
            }
        },
        [upsertConversation]
    );

    const deleteConversation = useCallback(
        async (conversationId: string) => {
            try {
                stopGeneration(conversationId);
                await chatApi.deleteConversation(conversationId);

                setConversations((current) =>
                    current.filter(
                        (conversation) => conversation.id !== conversationId
                    )
                );

                setConversationDetails((current) => {
                    const { [conversationId]: _removedConversation, ...rest } =
                        current;
                    return rest;
                });

                setConversationErrors((current) => {
                    const { [conversationId]: _removedError, ...rest } =
                        current;
                    return rest;
                });

                setConversationLoadingState((current) => {
                    const { [conversationId]: _removedLoadingState, ...rest } =
                        current;
                    return rest;
                });

                setConversationSendingState((current) => {
                    const { [conversationId]: _removedSendingState, ...rest } =
                        current;
                    return rest;
                });

                setConversationTodos((current) => {
                    const { [conversationId]: _removedTodos, ...rest } =
                        current;
                    return rest;
                });
            } catch (error) {
                throw new Error(getErrorMessage(error));
            }
        },
        [stopGeneration]
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
            deleteConversation,
            getConversation,
            getConversationError,
            getConversationTodos,
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
            renameConversation,
            isThinkingEnabled,
            reconnectToGeneration,
            selectedModelId,
            sendMessage,
            setSelectedModelId,
            setThinkingEnabled: setIsThinkingEnabled,
            stopGeneration,
            toggleFavoriteConversation
        }),
        [
            availableModels,
            conversations,
            conversationsError,
            createConversation,
            deleteConversation,
            getConversation,
            getConversationError,
            getConversationTodos,
            isConversationLoading,
            isConversationSending,
            isCreatingConversation,
            isLoadingConversations,
            isLoadingModels,
            isThinkingEnabled,
            loadConversation,
            loadConversations,
            loadModels,
            markConversationRead,
            modelsError,
            renameConversation,
            reconnectToGeneration,
            selectedModelId,
            sendMessage,
            setSelectedModelId,
            stopGeneration,
            toggleFavoriteConversation
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
