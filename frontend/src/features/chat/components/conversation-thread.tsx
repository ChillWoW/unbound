import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
    ChatErrorRecovery,
    ChatModel,
    ConversationDetail,
    ProviderType
} from "../types";
import { useChat } from "../chat-context";
import { type ChatAttachment } from "./chat-input";
import { InputDock } from "./input-dock";
import {
    buildMessageTree,
    ensureTreeStructure,
    resolveActivePath,
    type BranchSelections
} from "../utils/message-tree";
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";

const EMPTY_CONFIGURED_PROVIDERS: ProviderType[] = [];

interface ConversationThreadProps {
    availableModels: ChatModel[];
    configuredProviders?: ProviderType[];
    conversation: ConversationDetail;
    error?: string | null;
    isSending?: boolean;
    isLoadingModels?: boolean;
    isDeepResearchEnabled?: boolean;
    isThinkingEnabled?: boolean;
    modelsError?: string | null;
    modelsErrorRecovery?: ChatErrorRecovery | null;
    onDeepResearchChange?: (enabled: boolean) => void;
    onModelChange: (modelId: string | null, source?: ProviderType) => void;
    onStop?: () => void;
    onSubmit: (
        value: string,
        attachments: ChatAttachment[],
        parentMessageId?: string
    ) => Promise<void> | void;
    onThinkingChange?: (enabled: boolean) => void;
    selectedModelId: string | null;
}

export function ConversationThread({
    availableModels,
    configuredProviders = EMPTY_CONFIGURED_PROVIDERS,
    conversation,
    error,
    isSending = false,
    isLoadingModels = false,
    isDeepResearchEnabled = false,
    isThinkingEnabled = false,
    modelsError = null,
    modelsErrorRecovery = null,
    onDeepResearchChange,
    onModelChange,
    onStop,
    onThinkingChange,
    selectedModelId,
    onSubmit
}: ConversationThreadProps) {
    const { getConversationTodos, regenerateMessage, editAndResend } =
        useChat();
    const todos = getConversationTodos(conversation.id);

    const [branchSelections, setBranchSelections] = useState<BranchSelections>(
        new Map()
    );
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null
    );

    const patchedMessages = useMemo(
        () => ensureTreeStructure(conversation.messages),
        [conversation.messages]
    );
    const tree = useMemo(
        () => buildMessageTree(patchedMessages),
        [patchedMessages]
    );
    const displayPath = useMemo(
        () => resolveActivePath(tree, branchSelections),
        [tree, branchSelections]
    );

    const handleBranchSelect = useCallback(
        (parentKey: string | null, messageId: string) => {
            setBranchSelections((prev) => {
                const next = new Map(prev);
                next.set(parentKey, messageId);
                return next;
            });
        },
        []
    );

    const handleRegenerate = useCallback(
        (assistantMessageId: string) => {
            void regenerateMessage(conversation.id, assistantMessageId);
        },
        [conversation.id, regenerateMessage]
    );

    const handleEditSave = useCallback(
        (messageId: string, newContent: string) => {
            setEditingMessageId(null);
            void editAndResend(conversation.id, messageId, newContent);
        },
        [conversation.id, editAndResend]
    );

    const BOTTOM_SCROLL_THRESHOLD = 48;
    const RETURN_TO_BOTTOM_THRESHOLD = 16;
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastMessageCountRef = useRef(0);
    const scrollRafRef = useRef<number | null>(null);
    const atBottomRef = useRef(true);
    const [isAtBottom, setIsAtBottom] = useState(true);

    const updateAtBottom = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;

        const distanceFromBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
        const nextIsAtBottom = atBottomRef.current
            ? distanceFromBottom <= BOTTOM_SCROLL_THRESHOLD
            : distanceFromBottom <= RETURN_TO_BOTTOM_THRESHOLD;

        atBottomRef.current = nextIsAtBottom;
        setIsAtBottom((prev) =>
            prev === nextIsAtBottom ? prev : nextIsAtBottom
        );
    }, []);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior });
        atBottomRef.current = true;
        setIsAtBottom(true);
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [conversation.id, scrollToBottom]);

    useEffect(() => {
        const messageCount = conversation.messages.length;
        const lastMessage = displayPath.at(-1);
        const isNewMessage = messageCount > lastMessageCountRef.current;
        const isAssistantStreaming =
            lastMessage?.role === "assistant" &&
            lastMessage?.status === "pending";

        if ((isNewMessage || isAssistantStreaming) && atBottomRef.current) {
            scrollToBottom();
        }

        lastMessageCountRef.current = messageCount;
    }, [conversation.messages, displayPath, scrollToBottom]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const onScroll = () => {
            if (scrollRafRef.current) return;
            scrollRafRef.current = requestAnimationFrame(() => {
                updateAtBottom();
                scrollRafRef.current = null;
            });
        };

        el.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            el.removeEventListener("scroll", onScroll);
            if (scrollRafRef.current) {
                cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = null;
            }
        };
    }, [updateAtBottom]);

    return (
        <section className="relative h-full">
            <div
                ref={scrollRef}
                className="h-full overflow-y-auto px-4 pt-6 pb-56"
            >
                <div className="mx-auto max-w-3xl 3xl:max-w-4xl space-y-5">
                    {displayPath.map((message) => {
                        if (message.role === "user") {
                            return (
                                <UserMessage
                                    key={message.id}
                                    message={message}
                                    tree={tree}
                                    onBranchSelect={handleBranchSelect}
                                    isEditing={editingMessageId === message.id}
                                    onEditStart={() =>
                                        setEditingMessageId(message.id)
                                    }
                                    onEditSave={(newText) =>
                                        handleEditSave(message.id, newText)
                                    }
                                    onEditCancel={() =>
                                        setEditingMessageId(null)
                                    }
                                    isSending={isSending}
                                />
                            );
                        }

                        return (
                            <AssistantMessage
                                key={message.id}
                                message={message}
                                availableModels={availableModels}
                                configuredProviders={configuredProviders}
                                tree={tree}
                                onBranchSelect={handleBranchSelect}
                                onModelChange={onModelChange}
                                onRegenerate={() =>
                                    handleRegenerate(message.id)
                                }
                                isSending={isSending}
                                selectedModelId={selectedModelId}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
                <div
                    className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
                    style={{
                        maskImage:
                            "linear-gradient(to top, black 60%, transparent 100%)",
                        WebkitMaskImage:
                            "linear-gradient(to top, black 60%, transparent 100%)",
                        backgroundColor: "var(--color-dark-950)"
                    }}
                />

                <div className="mx-auto max-w-3xl 3xl:max-w-4xl">
                    {error ? (
                        <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {error}
                        </div>
                    ) : null}

                    <div className="mb-2 flex h-8 justify-end">
                        <Button
                            type="button"
                            className={cn(
                                "h-7 px-2.5 text-xs transition-opacity text-dark-50 bg-dark-850 border border-dark-600 relative z-10",
                                !isAtBottom && conversation.messages.length > 0
                                    ? "opacity-100"
                                    : "pointer-events-none opacity-0"
                            )}
                            tabIndex={
                                !isAtBottom && conversation.messages.length > 0
                                    ? 0
                                    : -1
                            }
                            onClick={() => scrollToBottom("smooth")}
                        >
                            <ArrowDownIcon className="size-3.5" weight="bold" />
                            Back to bottom
                        </Button>
                    </div>

                    <InputDock
                        models={availableModels}
                        configuredProviders={configuredProviders}
                        selectedModelId={selectedModelId}
                        onSelectedModelChange={onModelChange}
                        isModelsLoading={isLoadingModels}
                        isDeepResearchEnabled={isDeepResearchEnabled}
                        isThinkingEnabled={isThinkingEnabled}
                        modelsError={modelsError}
                        modelsErrorRecovery={modelsErrorRecovery}
                        onDeepResearchChange={onDeepResearchChange}
                        onThinkingChange={onThinkingChange}
                        showContextBadge
                        placeholder="Send a message..."
                        {...(onStop && { onStop })}
                        onSubmit={(value, attachments) => {
                            const lastMsg = displayPath.at(-1);
                            return onSubmit(value, attachments, lastMsg?.id);
                        }}
                        isSubmitting={isSending}
                        conversationMessages={conversation.messages}
                        todos={todos}
                    />
                </div>
            </div>
        </section>
    );
}
