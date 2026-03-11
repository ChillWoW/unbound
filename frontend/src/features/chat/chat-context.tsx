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
import {
    parseAIStream,
    type ReconnectState,
    type StreamErrorEvent
} from "./utils/parse-ai-stream";
import type { ChatAttachment } from "./components/chat-input";
import type {
    AttachmentPayload,
    CitationSource,
    ChatErrorRecovery,
    ChatModel,
    ConversationDetail,
    ConversationMessage,
    ConversationSummary,
    MessagePart,
    ProviderType,
    TodoItem,
    TodoPriority,
    TodoStatus,
    ToolInvocationPart
} from "./types";
import {
    getApiErrorRecovery,
    parseChatErrorRecovery
} from "./recovery";
import { normalizeSafeLinkUrl } from "@/lib/safe-url";

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

async function prepareAttachments(
    attachments: ChatAttachment[]
): Promise<AttachmentPayload[]> {
    return Promise.all(
        attachments.map(async (a) => ({
            data: await fileToBase64(a.file),
            mimeType: a.file.type,
            filename: a.file.name,
            size: a.file.size
        }))
    );
}

function normalizeCitationUrl(value: unknown): string | null {
    return normalizeSafeLinkUrl(value);
}

function citationHost(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

function extractSourcesFromToolResult(
    toolName: string,
    result: unknown
): CitationSource[] {
    if (!result || typeof result !== "object") {
        return [];
    }

    const record = result as Record<string, unknown>;

    if (toolName === "webSearch") {
        const results = Array.isArray(record.results)
            ? (record.results as Array<Record<string, unknown>>)
            : [];

        return results
            .map<CitationSource | null>((entry, index) => {
                const url = normalizeCitationUrl(entry.url);
                if (!url) return null;

                const title =
                    typeof entry.title === "string" && entry.title.trim()
                        ? entry.title.trim()
                        : `Source ${index + 1}`;
                const snippet =
                    typeof entry.content === "string" && entry.content.trim()
                        ? entry.content.trim()
                        : undefined;

                return {
                    id: `${toolName}-${index}-${url}`,
                    title,
                    url,
                    host: citationHost(url),
                    snippet,
                    sourceType: "web" as const
                };
            })
            .filter((entry): entry is CitationSource => entry !== null);
    }

    if (toolName === "scrape") {
        const url = normalizeCitationUrl(record.url ?? record.proxyUrl);
        if (!url) return [];

        const snippet =
            typeof record.content === "string" && record.content.trim()
                ? record.content.trim().slice(0, 280)
                : undefined;

        return [
            {
                id: `${toolName}-${url}`,
                title: citationHost(url),
                url,
                host: citationHost(url),
                snippet,
                sourceType: "web"
            }
        ];
    }

    return [];
}

function mergeSources(
    existing: CitationSource[] | undefined,
    incoming: CitationSource[]
): CitationSource[] {
    if (incoming.length === 0) {
        return existing ?? [];
    }

    const merged = new Map<string, CitationSource>();

    for (const source of existing ?? []) {
        merged.set(source.id, source);
    }

    for (const source of incoming) {
        merged.set(source.id, source);
    }

    return [...merged.values()];
}

function withMessageMetadataSources(
    message: ConversationMessage,
    incomingSources: CitationSource[]
): ConversationMessage {
    if (incomingSources.length === 0) {
        return message;
    }

    return {
        ...message,
        metadata: {
            ...(message.metadata ?? {}),
            sources: mergeSources(message.metadata?.sources, incomingSources)
        }
    };
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

interface StoredModelSelection {
    modelId: string;
    source: ProviderType;
}

const THINKING_ONLY_MODEL_IDS = new Set(["kimi-k2-thinking"]);

function getSelectableModels(models: ChatModel[], isThinkingEnabled: boolean) {
    if (isThinkingEnabled) {
        return models;
    }

    return models.filter((model) => !THINKING_ONLY_MODEL_IDS.has(model.id));
}

function readStoredModelSelection(
    userId: string
): StoredModelSelection | null {
    if (typeof window === "undefined") return null;

    const raw = window.localStorage.getItem(
        getSelectedModelStorageKey(userId)
    );
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            typeof parsed.modelId === "string" &&
            typeof parsed.source === "string"
        ) {
            return parsed as StoredModelSelection;
        }
    } catch {
        // backward compat: old format stored a plain modelId string
    }

    return { modelId: raw, source: "openrouter" };
}

function writeStoredModelSelection(
    userId: string,
    selection: StoredModelSelection | null
) {
    if (typeof window === "undefined") return;

    const key = getSelectedModelStorageKey(userId);

    if (!selection) {
        window.localStorage.removeItem(key);
        return;
    }

    window.localStorage.setItem(key, JSON.stringify(selection));
}

interface ChatContextValue {
    availableModels: ChatModel[];
    configuredProviders: ProviderType[];
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
    modelsErrorRecovery: ChatErrorRecovery | null;
    renameConversation: (
        conversationId: string,
        title: string
    ) => Promise<void>;
    reconnectToGeneration: (conversationId: string) => Promise<void>;
    isThinkingEnabled: boolean;
    selectedModelId: string | null;
    regenerateMessage: (
        conversationId: string,
        assistantMessageId: string
    ) => Promise<void>;
    editAndResend: (
        conversationId: string,
        messageId: string,
        newContent: string,
        attachments?: ChatAttachment[]
    ) => Promise<void>;
    sendMessage: (
        conversationId: string,
        prompt: string,
        attachments?: ChatAttachment[],
        parentMessageId?: string
    ) => Promise<ConversationDetail>;
    setSelectedModelId: (
        modelId: string | null,
        source?: ProviderType
    ) => void;
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

function previewTodosFromToolCall(
    toolName: string,
    args: Record<string, unknown>,
    currentTodos: TodoItem[]
): TodoItem[] | null {
    if (toolName === "todoSetStatus") {
        const updates = args.updates as
            | Array<{ todoId: string; status: string }>
            | undefined;
        if (!Array.isArray(updates) || updates.length === 0) return null;
        return currentTodos.map((todo) => {
            const update = updates.find((u) => u.todoId === todo.id);
            return update
                ? { ...todo, status: update.status as TodoStatus }
                : todo;
        });
    }
    if (toolName === "todoWrite") {
        const incoming = args.todos as
            | Array<{
                  id: string;
                  content: string;
                  status: string;
                  priority?: string;
              }>
            | undefined;
        const merge = args.merge as boolean | undefined;
        if (!Array.isArray(incoming)) return null;
        if (!merge) {
            return incoming.map((t, i) => ({
                id: t.id,
                content: t.content,
                status: t.status as TodoStatus,
                priority: (t.priority ?? "medium") as TodoPriority,
                position: i,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));
        }
        const map = new Map(currentTodos.map((t) => [t.id, t]));
        let nextPosition = currentTodos.length;
        for (const t of incoming) {
            const existing = map.get(t.id);
            map.set(t.id, {
                id: t.id,
                content: t.content,
                status: t.status as TodoStatus,
                priority: (t.priority ?? "medium") as TodoPriority,
                position: existing?.position ?? nextPosition++,
                createdAt: existing?.createdAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
        return [...map.values()];
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

    const preservedArgs =
        incoming.state === "result" &&
        Object.keys(incoming.args).length === 0 &&
        Object.keys(existing.args).length > 0
            ? existing.args
            : incoming.args;

    parts[idx] = {
        ...existing,
        ...incoming,
        args: preservedArgs,
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

interface StreamState {
    parts: MessagePart[];
    messageId: string;
}

interface StreamCallbackDeps {
    conversationId: string;
    abortSignal: AbortSignal;
    setConversationDetails: React.Dispatch<
        React.SetStateAction<Record<string, ConversationDetail>>
    >;
    setConversationTodos: React.Dispatch<
        React.SetStateAction<Record<string, TodoItem[]>>
    >;
}

function createStreamCallbacks(state: StreamState, deps: StreamCallbackDeps) {
    let rafId: number | null = null;
    let dirty = false;

    function flushToState() {
        dirty = false;
        const snapshot: MessagePart[] = [...state.parts];
        const mid = state.messageId;
        deps.setConversationDetails((current) => {
            const existing = current[deps.conversationId];
            if (!existing) return current;
            return {
                ...current,
                [deps.conversationId]: {
                    ...existing,
                    messages: existing.messages.map((m) =>
                        m.id === mid ? { ...m, parts: snapshot } : m
                    )
                }
            };
        });
    }

    function scheduleFlush() {
        dirty = true;
        if (rafId === null) {
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (dirty) flushToState();
            });
        }
    }

    function flushNow() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (dirty) flushToState();
    }

    const callbacks = {
        onReasoning(text: string) {
            const last = state.parts[state.parts.length - 1];
            if (last?.type === "reasoning") {
                state.parts[state.parts.length - 1] = {
                    type: "reasoning",
                    text: last.text + text
                };
            } else {
                state.parts.push({ type: "reasoning", text });
            }
            scheduleFlush();
        },
        onTextDelta(text: string) {
            const last = state.parts[state.parts.length - 1];
            if (last?.type === "text") {
                state.parts[state.parts.length - 1] = {
                    type: "text",
                    text: last.text + text
                };
            } else {
                state.parts.push({ type: "text", text });
            }
            scheduleFlush();
        },
        onToolCallStart(toolCall: { toolCallId: string; toolName: string }) {
            upsertToolInvocationPart(state.parts, {
                type: "tool-invocation",
                toolInvocationId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                args: {},
                state: "call"
            });
            dirty = true;
            flushNow();
        },
        onToolCall(toolCall: {
            toolCallId: string;
            toolName: string;
            args: Record<string, unknown>;
        }) {
            upsertToolInvocationPart(state.parts, {
                type: "tool-invocation",
                toolInvocationId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                args: toolCall.args,
                state: "call"
            });
            dirty = true;
            flushNow();
            deps.setConversationTodos((current) => {
                const currentTodos = current[deps.conversationId] ?? [];
                const preview = previewTodosFromToolCall(
                    toolCall.toolName,
                    toolCall.args,
                    currentTodos
                );
                if (!preview) return current;
                return { ...current, [deps.conversationId]: preview };
            });
        },
        onToolResult(toolResult: {
            toolCallId: string;
            toolName: string;
            result: unknown;
        }) {
            applyToolResult(state.parts, toolResult);
            dirty = true;
            flushNow();
            const sources = extractSourcesFromToolResult(
                toolResult.toolName,
                toolResult.result
            );
            if (sources.length > 0) {
                const mid = state.messageId;
                deps.setConversationDetails((current) => {
                    const existing = current[deps.conversationId];
                    if (!existing) return current;

                    return {
                        ...current,
                        [deps.conversationId]: {
                            ...existing,
                            messages: existing.messages.map((message) =>
                                message.id === mid
                                    ? withMessageMetadataSources(message, sources)
                                    : message
                            )
                        }
                    };
                });
            }
            const todos = extractTodosFromToolResult(
                toolResult.toolName,
                toolResult.result
            );
            if (todos) {
                deps.setConversationTodos((current) => ({
                    ...current,
                    [deps.conversationId]: todos
                }));
            }
        },
        onError(error: StreamErrorEvent) {
            if (deps.abortSignal.aborted) return;
            flushNow();
            const mid = state.messageId;
            deps.setConversationDetails((current) => {
                const existing = current[deps.conversationId];
                if (!existing) return current;
                return {
                    ...current,
                    [deps.conversationId]: {
                        ...existing,
                        messages: existing.messages.map((m) =>
                            m.id === mid
                                ? {
                                      ...m,
                                      status: "failed" as const,
                                      errorMessage: error.message,
                                      metadata: {
                                          ...(m.metadata ?? {}),
                                          errorMessage: error.message,
                                          ...(error.recovery
                                              ? {
                                                    errorRecovery:
                                                        error.recovery
                                                }
                                              : {})
                                      }
                                  }
                                : m
                        )
                    }
                };
            });
        }
    };

    return { callbacks, flushNow };
}

export function ChatProvider({ children }: PropsWithChildren) {
    const { isAuthenticated, isLoading, user } = useAuth();
    const canUseApp = isAuthenticated && (user?.isEmailVerified ?? false);
    const [allModels, setAllModels] = useState<ChatModel[]>([]);
    const [configuredProviders, setConfiguredProviders] = useState<
        ProviderType[]
    >([]);
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
    const [modelsErrorRecovery, setModelsErrorRecovery] =
        useState<ChatErrorRecovery | null>(null);
    const [isLoadingConversations, setIsLoadingConversations] = useState(false);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [isCreatingConversation, setIsCreatingConversation] = useState(false);
    const [selectedModelId, setSelectedModelIdState] = useState<string | null>(
        null
    );
    const selectedModelIdRef = useRef<string | null>(null);
    const selectedModelSourceRef = useRef<ProviderType | null>(null);
    const availableModelsRef = useRef<ChatModel[]>([]);
    const [isThinkingEnabled, setIsThinkingEnabled] = useState(
        () => localStorage.getItem("thinking-enabled") === "true"
    );
    const availableModels = useMemo(() => allModels, [allModels]);
    const isThinkingEnabledRef = useRef(false);
    const activeGenerationsRef = useRef<Map<string, AbortController>>(
        new Map()
    );
    const titleRefreshTimersRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        selectedModelIdRef.current = selectedModelId;
    }, [selectedModelId]);

    useEffect(() => {
        availableModelsRef.current = availableModels;
    }, [availableModels]);

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

    const applyConversationTitleUpdate = useCallback(
        (conversationId: string, title: string, titleSource: string) => {
            setConversations((current) =>
                current.map((conversation) =>
                    conversation.id === conversationId
                        ? { ...conversation, title, titleSource }
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
                        title,
                        titleSource
                    }
                };
            });
        },
        []
    );

    const stopTitleRefresh = useCallback((conversationId: string) => {
        const timer = titleRefreshTimersRef.current.get(conversationId);

        if (timer !== undefined) {
            window.clearTimeout(timer);
            titleRefreshTimersRef.current.delete(conversationId);
        }
    }, []);

    const refreshConversationTitle = useCallback(
        async (conversationId: string, attemptsLeft = 8) => {
            stopTitleRefresh(conversationId);

            if (attemptsLeft <= 0) {
                return;
            }

            const currentConversation =
                conversationDetails[conversationId] ??
                conversations.find((item) => item.id === conversationId);

            if (!currentConversation || currentConversation.titleSource !== "prompt") {
                return;
            }

            const timer = window.setTimeout(async () => {
                try {
                    const response = await chatApi.getConversation(conversationId);
                    upsertConversation(response.conversation);

                    if (response.conversation.titleSource === "prompt") {
                        void refreshConversationTitle(
                            conversationId,
                            attemptsLeft - 1
                        );
                    }
                } catch {
                    void refreshConversationTitle(conversationId, attemptsLeft - 1);
                }
            }, 1000);

            titleRefreshTimersRef.current.set(conversationId, timer);
        },
        [conversationDetails, conversations, stopTitleRefresh, upsertConversation]
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
        if (!canUseApp) {
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
    }, [canUseApp]);

    const loadModels = useCallback(async () => {
        setIsLoadingModels(true);
        setModelsError(null);
        setModelsErrorRecovery(null);

        try {
            const response = await chatApi.listModels();
            const stored = user
                ? readStoredModelSelection(user.id)
                : null;
            const selectableModels = getSelectableModels(
                response.models,
                isThinkingEnabledRef.current
            );
            const currentId = selectedModelIdRef.current;

            let nextId: string | null = null;
            let nextSource: ProviderType | null = null;

            if (
                stored &&
                selectableModels.some((m) => m.id === stored.modelId)
            ) {
                nextId = stored.modelId;
                nextSource = stored.source;
            } else if (
                currentId &&
                selectableModels.some((m) => m.id === currentId)
            ) {
                nextId = currentId;
                nextSource =
                    selectedModelSourceRef.current ??
                    (selectableModels.find((m) => m.id === currentId)?.source ??
                        null);
            } else if (selectableModels.length > 0) {
                nextId = selectableModels[0].id;
                nextSource = selectableModels[0].source;
            }

            setAllModels(response.models);
            setConfiguredProviders(response.configuredProviders ?? []);
            setSelectedModelIdState(nextId);
            selectedModelSourceRef.current = nextSource;
            if (user && nextId && nextSource) {
                writeStoredModelSelection(user.id, {
                    modelId: nextId,
                    source: nextSource
                });
            }
        } catch (error) {
            setAllModels([]);
            setConfiguredProviders([]);
            setSelectedModelIdState(null);
            selectedModelSourceRef.current = null;
            setModelsError(getErrorMessage(error));
            setModelsErrorRecovery(getApiErrorRecovery(error));
            throw error;
        } finally {
            setIsLoadingModels(false);
        }
    }, [user]);

    useEffect(() => {
        if (availableModels.length === 0) return;

        const selectableModels = getSelectableModels(
            availableModels,
            isThinkingEnabled
        );
        const currentId = selectedModelIdRef.current;

        if (
            currentId &&
            selectableModels.some((model) => model.id === currentId)
        ) {
            return;
        }

        const stored = user ? readStoredModelSelection(user.id) : null;
        const nextModel =
            (stored
                ? selectableModels.find((model) => model.id === stored.modelId)
                : null) ?? selectableModels[0] ?? null;

        setSelectedModelIdState(nextModel?.id ?? null);
        selectedModelSourceRef.current = nextModel?.source ?? null;

        if (!user) {
            return;
        }

        if (nextModel) {
            writeStoredModelSelection(user.id, {
                modelId: nextModel.id,
                source: nextModel.source
            });
        } else {
            writeStoredModelSelection(user.id, null);
        }
    }, [availableModels, isThinkingEnabled, user]);

    useEffect(() => {
        if (isLoading) {
            return;
        }

        if (!canUseApp) {
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
    }, [canUseApp, isLoading, loadConversations]);

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
        async (
            conversationId: string,
            modelId: string,
            provider: string,
            replyToMessageId?: string
        ) => {
            const thinking = isThinkingEnabledRef.current;
            const abortController = new AbortController();
            activeGenerationsRef.current.set(conversationId, abortController);
            const generationStartedAt = new Date().toISOString();

            const optimisticId = `msg_optimistic_${Date.now()}`;
            const optimisticMessage: ConversationMessage = {
                id: optimisticId,
                parentMessageId: replyToMessageId ?? null,
                role: "assistant",
                parts: [],
                status: "pending",
                createdAt: new Date().toISOString(),
                metadata: {
                    model: modelId,
                    provider,
                    thinkingEnabled: thinking,
                    generationStartedAt
                }
            };

            const markGenerationStartFailure = (
                message: string,
                recovery?: ChatErrorRecovery | null,
                assistantMessageId?: string | null
            ) => {
                const generationCompletedAt = new Date().toISOString();
                setConversationDetails((current) => {
                    const existing = current[conversationId];
                    if (!existing) return current;
                    return {
                        ...current,
                        [conversationId]: {
                            ...existing,
                            messages: existing.messages.map((m) =>
                                m.id === optimisticId
                                    ? {
                                          ...m,
                                          id: assistantMessageId ?? optimisticId,
                                          status: "failed" as const,
                                          errorMessage: message,
                                          metadata: {
                                              ...(m.metadata ?? {}),
                                              model: modelId,
                                              provider,
                                              thinkingEnabled: thinking,
                                              generationStartedAt,
                                              generationCompletedAt,
                                              errorMessage: message,
                                              ...(recovery
                                                  ? {
                                                        errorRecovery: recovery
                                                    }
                                                  : {})
                                          }
                                      }
                                    : m
                            )
                        }
                    };
                });
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
                    provider,
                    thinking,
                    abortController.signal,
                    replyToMessageId
                );
            } catch (error) {
                activeGenerationsRef.current.delete(conversationId);
                if (error instanceof Error && error.name === "AbortError")
                    return;
                markGenerationStartFailure(getErrorMessage(error));
                return;
            }

            if (!streamResponse.ok) {
                let errorMessage = "Generation failed.";
                let errorRecovery: ChatErrorRecovery | null = null;
                let assistantMessageId: string | null = null;
                try {
                    const errorData = await streamResponse.json();
                    if (errorData?.message) errorMessage = errorData.message;
                    if (errorData && typeof errorData === "object") {
                        const payload = errorData as Record<string, unknown>;
                        errorRecovery = parseChatErrorRecovery(payload.recovery);
                        assistantMessageId =
                            typeof payload.assistantMessageId === "string"
                                ? payload.assistantMessageId
                                : null;
                    }
                } catch {
                    // use default
                }

                markGenerationStartFailure(
                    errorMessage,
                    errorRecovery,
                    assistantMessageId
                );
                activeGenerationsRef.current.delete(conversationId);
                return;
            }

            const streamState: StreamState = {
                parts: [],
                messageId: optimisticId
            };

            const { callbacks, flushNow } = createStreamCallbacks(
                streamState,
                {
                    conversationId,
                    abortSignal: abortController.signal,
                    setConversationDetails,
                    setConversationTodos
                }
            );

            const STREAM_DONE_TIMEOUT_MS = 15_000;
            let streamDoneTimer: ReturnType<typeof setTimeout> | null = null;

            await parseAIStream(streamResponse, {
                    onMessageStart(messageId) {
                        streamState.messageId = messageId;
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
                    onConversationTitle(title, titleSource) {
                        stopTitleRefresh(conversationId);
                        applyConversationTitleUpdate(
                            conversationId,
                            title,
                            titleSource
                        );
                    },
                    ...callbacks,
                    onFinish() {
                        streamDoneTimer = setTimeout(() => {
                            abortController.abort();
                        }, STREAM_DONE_TIMEOUT_MS);
                    }
                }).catch((error: unknown) => {
                if (!(error instanceof Error && error.name === "AbortError")) {
                    throw error;
                }
            });

            if (streamDoneTimer) clearTimeout(streamDoneTimer);

            flushNow();
            activeGenerationsRef.current.delete(conversationId);

            for (let i = 0; i < streamState.parts.length; i++) {
                const p = streamState.parts[i];
                if (p.type === "tool-invocation" && p.state === "call") {
                    streamState.parts[i] = { ...p, state: "error" };
                }
            }

            if (abortController.signal.aborted) {
                const stoppedParts = [...streamState.parts];
                savePartialMessage(streamState.messageId, stoppedParts);
                setConversationDetails((current) => {
                    const existing = current[conversationId];
                    if (!existing) return current;
                    return {
                        ...current,
                        [conversationId]: {
                            ...existing,
                            messages: existing.messages.map((m) =>
                                m.id === streamState.messageId
                                    ? {
                                          ...m,
                                          status: "complete" as const,
                                          parts: stoppedParts
                                      }
                                    : m
                            )
                        }
                    };
                });
                return;
            }

            try {
                let finalResponse = await chatApi.getConversation(conversationId);

                const finalMsg = finalResponse.conversation.messages?.find(
                    (m: { id: string }) => m.id === streamState.messageId
                );
                if (finalMsg?.status === "pending") {
                    for (let attempt = 0; attempt < 3; attempt++) {
                        await new Promise((r) => setTimeout(r, 2000));
                        try {
                            const poll = await chatApi.getConversation(conversationId);
                            const pollMsg = poll.conversation.messages?.find(
                                (m: { id: string }) => m.id === streamState.messageId
                            );
                            if (pollMsg?.status !== "pending") {
                                finalResponse = poll;
                                break;
                            }
                        } catch {
                            /* continue polling */
                        }
                    }
                }

                clearPartialMessage(
                    finalResponse.conversation.latestAssistantMessageId ?? ""
                );
                upsertConversation(finalResponse.conversation);
                if (finalResponse.conversation.titleSource === "prompt") {
                    void refreshConversationTitle(conversationId);
                } else {
                    stopTitleRefresh(conversationId);
                }
            } catch {
                const finalParts = [...streamState.parts];
                setConversationDetails((current) => {
                    const existing = current[conversationId];
                    if (!existing) return current;
                    return {
                        ...current,
                        [conversationId]: {
                            ...existing,
                            messages: existing.messages.map((m) =>
                                m.id === streamState.messageId &&
                                m.status === "pending"
                                    ? {
                                          ...m,
                                          status:
                                              finalParts.length > 0
                                                  ? ("complete" as const)
                                                  : ("failed" as const),
                                          parts: finalParts,
                                          ...(finalParts.length === 0
                                              ? {
                                                    errorMessage:
                                                        "Connection lost. Please try again."
                                                }
                                              : {})
                                      }
                                    : m
                            )
                        }
                    };
                });
            }
        },
        [
            applyConversationTitleUpdate,
            refreshConversationTitle,
            stopTitleRefresh,
            upsertConversation
        ]
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

                const messageId =
                    response.headers.get("x-message-id") ?? "";

                const streamState: StreamState = {
                    parts: [],
                    messageId
                };

                const { callbacks, flushNow } = createStreamCallbacks(
                    streamState,
                    {
                        conversationId,
                        abortSignal: abortController.signal,
                        setConversationDetails,
                        setConversationTodos
                    }
                );

                await parseAIStream(response, {
                    onMessageStart(mid) {
                        setConversationDetails((current) => {
                            const existing = current[conversationId];
                            if (!existing) return current;
                            const hasMessage = existing.messages.some(
                                (m) => m.id === mid
                            );
                            if (hasMessage) {
                                return {
                                    ...current,
                                    [conversationId]: {
                                        ...existing,
                                        messages: existing.messages.map((m) =>
                                            m.id === mid
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
                    onConversationTitle(title, titleSource) {
                        stopTitleRefresh(conversationId);
                        applyConversationTitleUpdate(
                            conversationId,
                            title,
                            titleSource
                        );
                    },
                    onReconnectState(state: ReconnectState) {
                        streamState.parts.length = 0;
                        if (state.reasoning) {
                            streamState.parts.push({
                                type: "reasoning",
                                text: state.reasoning
                            });
                        }
                        for (const tp of state.toolParts) {
                            upsertToolInvocationPart(streamState.parts, tp);
                        }
                        if (state.text) {
                            streamState.parts.push({
                                type: "text",
                                text: state.text
                            });
                        }
                        flushNow();
                    },
                    ...callbacks
                }).catch((error: unknown) => {
                    if (
                        !(error instanceof Error && error.name === "AbortError")
                    ) {
                        throw error;
                    }
                });

                flushNow();
                activeGenerationsRef.current.delete(conversationId);

                if (!abortController.signal.aborted) {
                    const finalResponse =
                        await chatApi.getConversation(conversationId);
                    upsertConversation(finalResponse.conversation);
                    if (finalResponse.conversation.titleSource === "prompt") {
                        void refreshConversationTitle(conversationId);
                    } else {
                        stopTitleRefresh(conversationId);
                    }
                }
            } catch {
                // reconnection is best-effort
            } finally {
                activeGenerationsRef.current.delete(conversationId);
                setConversationSending(conversationId, false);
            }
        },
        [
            applyConversationTitleUpdate,
            refreshConversationTitle,
            setConversationSending,
            stopTitleRefresh,
            upsertConversation
        ]
    );

    const createConversation = useCallback(
        async (prompt: string, attachments?: ChatAttachment[]) => {
            const modelId = selectedModelIdRef.current;

            if (!modelId) {
                throw new Error("No model selected.");
            }

            const provider =
                selectedModelSourceRef.current ??
                availableModelsRef.current.find((m) => m.id === modelId)
                    ?.source ??
                "openrouter";

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
                const firstUserMessageId =
                    response.conversation.messages.find(
                        (m) => m.role === "user"
                    )?.id;

                setConversationSending(conversationId, true);
                void refreshConversationTitle(conversationId);
                runGeneration(
                    conversationId,
                    modelId,
                    provider,
                    firstUserMessageId
                )
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
        [refreshConversationTitle, runGeneration, setConversationSending, upsertConversation]
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
            attachments?: ChatAttachment[],
            parentMessageId?: string
        ) => {
            const modelId = selectedModelIdRef.current;

            if (!modelId) {
                throw new Error("No model selected.");
            }

            const provider =
                selectedModelSourceRef.current ??
                availableModelsRef.current.find((m) => m.id === modelId)
                    ?.source ??
                "openrouter";

            setConversationSending(conversationId, true);

            try {
                const preparedAttachments = attachments?.length
                    ? await prepareAttachments(attachments)
                    : undefined;
                const persistResponse = await chatApi.sendMessage(
                    conversationId,
                    prompt,
                    preparedAttachments,
                    parentMessageId
                );
                upsertConversation(persistResponse.conversation);

                const newUserMessageId = persistResponse.newMessageId;
                await runGeneration(
                    conversationId,
                    modelId,
                    provider,
                    newUserMessageId
                );

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

    const regenerateMessage = useCallback(
        async (conversationId: string, assistantMessageId: string) => {
            const modelId = selectedModelIdRef.current;
            if (!modelId) {
                throw new Error("No model selected.");
            }

            const provider =
                selectedModelSourceRef.current ??
                availableModelsRef.current.find((m) => m.id === modelId)
                    ?.source ??
                "openrouter";

            const conversation = conversationDetails[conversationId];
            if (!conversation) {
                throw new Error("Conversation not found.");
            }

            const assistantMsg = conversation.messages.find(
                (m) => m.id === assistantMessageId
            );
            if (!assistantMsg) {
                throw new Error("Message not found.");
            }

            const replyToId = assistantMsg.parentMessageId;
            if (!replyToId) {
                throw new Error("Cannot regenerate: no parent message.");
            }

            setConversationSending(conversationId, true);
            try {
                await runGeneration(
                    conversationId,
                    modelId,
                    provider,
                    replyToId
                );
            } catch (error) {
                throw new Error(getErrorMessage(error));
            } finally {
                setConversationSending(conversationId, false);
            }
        },
        [conversationDetails, runGeneration, setConversationSending]
    );

    const editAndResend = useCallback(
        async (
            conversationId: string,
            messageId: string,
            newContent: string,
            attachments?: ChatAttachment[]
        ) => {
            const modelId = selectedModelIdRef.current;
            if (!modelId) {
                throw new Error("No model selected.");
            }

            const provider =
                selectedModelSourceRef.current ??
                availableModelsRef.current.find((m) => m.id === modelId)
                    ?.source ??
                "openrouter";

            setConversationSending(conversationId, true);
            try {
                const preparedAttachments = attachments?.length
                    ? await prepareAttachments(attachments)
                    : undefined;
                const editResponse = await chatApi.editMessage(
                    conversationId,
                    messageId,
                    newContent,
                    preparedAttachments
                );
                upsertConversation(editResponse.conversation);

                const newUserMessageId = editResponse.newMessageId;
                await runGeneration(
                    conversationId,
                    modelId,
                    provider,
                    newUserMessageId
                );
            } catch (error) {
                throw new Error(getErrorMessage(error));
            } finally {
                setConversationSending(conversationId, false);
            }
        },
        [runGeneration, setConversationSending, upsertConversation]
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

                stopTitleRefresh(conversationId);

                setConversationTodos((current) => {
                    const { [conversationId]: _removedTodos, ...rest } =
                        current;
                    return rest;
                });
            } catch (error) {
                throw new Error(getErrorMessage(error));
            }
        },
        [stopGeneration, stopTitleRefresh]
    );

    const setSelectedModelId = useCallback(
        (modelId: string | null, source?: ProviderType) => {
            setSelectedModelIdState(modelId);
            selectedModelSourceRef.current = source ?? null;

            if (!user) return;

            if (modelId && source) {
                writeStoredModelSelection(user.id, { modelId, source });
            } else {
                writeStoredModelSelection(user.id, null);
            }
        },
        [user]
    );

    const value = useMemo<ChatContextValue>(
        () => ({
            availableModels,
            configuredProviders,
            conversations,
            conversationsError,
            createConversation,
            deleteConversation,
            editAndResend,
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
            modelsErrorRecovery,
            regenerateMessage,
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
            configuredProviders,
            conversations,
            conversationsError,
            createConversation,
            deleteConversation,
            editAndResend,
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
            modelsErrorRecovery,
            regenerateMessage,
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
