import { useCallback, useEffect, useRef, useState } from "react";
import {
    ArrowDownIcon,
    BrainIcon,
    CaretRightIcon,
    CopyIcon,
    CheckIcon,
    ClockIcon,
    ListChecksIcon,
    ChatTeardropTextIcon
} from "@phosphor-icons/react";
import { Button, Tooltip, ImageViewer } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
    ChatModel,
    ConversationDetail,
    ConversationMessage,
    MessageMetadata,
    MessagePart,
    ReasoningMessagePart,
    ToolInvocationPart
} from "../types";
import { type ChatAttachment } from "./chat-input";
import { InputDock } from "./input-dock";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";

function getMessageText(parts: MessagePart[]) {
    return parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n")
        .trim();
}

function formatTime(isoString: string): string {
    try {
        return new Date(isoString).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
        });
    } catch {
        return "";
    }
}

function formatDuration(startIso: string, endIso: string): string | null {
    try {
        const start = new Date(startIso).getTime();
        const end = new Date(endIso).getTime();

        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
            return null;
        }

        const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${minutes}m ${seconds}s`;
    } catch {
        return null;
    }
}

function getModelDisplayName(
    modelId: string,
    availableModels: ChatModel[]
): string {
    const model = availableModels.find((m) => m.id === modelId);
    return model?.name ?? modelId.split("/").pop() ?? modelId;
}

function ReasoningDisplay({
    part,
    isStreaming
}: {
    part: ReasoningMessagePart;
    isStreaming: boolean;
}) {
    const [expanded, setExpanded] = useState(true);
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
    const reasoningScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isStreaming) setExpanded(false);
    }, [isStreaming]);

    useEffect(() => {
        const el = reasoningScrollRef.current;
        if (!el) return;

        const check = () => {
            setIsScrolledToBottom(
                el.scrollHeight - el.scrollTop - el.clientHeight < 4
            );
        };

        check();
        el.addEventListener("scroll", check, { passive: true });
        return () => el.removeEventListener("scroll", check);
    }, [expanded, part.text]);

    return (
        <div className="my-2">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs"
            >
                <span
                    className={cn(
                        "font-medium",
                        isStreaming ? "wave-text" : "text-dark-200"
                    )}
                >
                    Thinking
                </span>
                <CaretRightIcon
                    className={cn(
                        "size-3 text-dark-200 transition-transform",
                        expanded && "rotate-90"
                    )}
                    weight="bold"
                />
            </button>
            {expanded && (
                <div className="relative mt-2">
                    <div
                        ref={reasoningScrollRef}
                        className="max-h-72 overflow-y-auto"
                    >
                        <p className="whitespace-pre-wrap text-xs leading-5 text-dark-200">
                            {part.text}
                        </p>
                    </div>
                    {!isScrolledToBottom && (
                        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-dark-900 to-transparent" />
                    )}
                </div>
            )}
        </div>
    );
}

function ToolInvocationDisplay({ part }: { part: ToolInvocationPart }) {
    const [expanded, setExpanded] = useState(false);
    const isPending = part.state === "call";
    const hasOutput = part.state === "result" && part.result !== undefined;

    return (
        <div className="my-1.5">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs"
            >
                <span
                    className={cn(
                        "font-medium",
                        isPending ? "wave-text" : "text-dark-300"
                    )}
                >
                    {part.toolName}
                </span>
                <CaretRightIcon
                    className={cn(
                        "size-3 text-dark-300 transition-transform",
                        expanded && "rotate-90"
                    )}
                    weight="bold"
                />
            </button>

            {expanded && hasOutput && (
                <pre className="mt-2 overflow-x-auto rounded bg-dark-900 p-2 text-xs text-dark-100">
                    {typeof part.result === "string"
                        ? part.result
                        : JSON.stringify(part.result, null, 2)}
                </pre>
            )}
        </div>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
    }, [text]);

    return (
        <Tooltip content={copied ? "Copied!" : "Copy"} side="top">
            <button
                type="button"
                onClick={handleCopy}
                className="flex size-7 items-center justify-center rounded-md text-dark-300 transition-colors hover:bg-dark-800 hover:text-white"
            >
                {copied ? (
                    <CheckIcon className="size-3.5" weight="bold" />
                ) : (
                    <CopyIcon className="size-3.5" weight="bold" />
                )}
            </button>
        </Tooltip>
    );
}

function AssistantMessageMetadataDisplay({
    metadata,
    availableModels
}: {
    metadata: MessageMetadata | null;
    availableModels: ChatModel[];
}) {
    if (!metadata) return null;

    const model = metadata.model
        ? getModelDisplayName(metadata.model, availableModels)
        : null;
    const duration =
        metadata.generationStartedAt && metadata.generationCompletedAt
            ? formatDuration(
                  metadata.generationStartedAt,
                  metadata.generationCompletedAt
              )
            : null;
    const usedThinking = metadata.thinkingEnabled === true;

    if (!model && !duration && !usedThinking) return null;

    return (
        <div className="flex items-center gap-2 text-[11px] text-dark-300">
            {model && <span>{model}</span>}
            {model && (usedThinking || duration) && <span>-</span>}
            {usedThinking && (
                <span className="flex items-center gap-1">
                    <BrainIcon className="size-3" weight="fill" />
                    Thinking
                </span>
            )}
            {usedThinking && duration && <span>-</span>}
            {duration && (
                <span className="flex items-center gap-1">
                    <ClockIcon className="size-3" weight="bold" />
                    {duration}
                </span>
            )}
        </div>
    );
}

function UserMessageMetadataDisplay({
    metadata,
    createdAt
}: {
    metadata: MessageMetadata | null;
    createdAt: string;
}) {
    const sentAt =
        typeof metadata?.sentAt === "string" ? metadata.sentAt : createdAt;
    const time = formatTime(sentAt);

    if (!time) return null;

    return (
        <div className="flex items-center gap-1 text-[11px] text-dark-300">
            <ClockIcon className="size-3" weight="bold" />
            <span>{time}</span>
        </div>
    );
}

function StreamingIndicator() {
    return (
        <div className="py-1">
            <span className="wave-text text-xs font-medium">
                Planning next moves
            </span>
        </div>
    );
}

function AssistantMessage({
    message,
    availableModels
}: {
    message: ConversationMessage;
    availableModels: ChatModel[];
}) {
    const text = getMessageText(message.parts);
    const toolParts = message.parts.filter(
        (p): p is ToolInvocationPart => p.type === "tool-invocation"
    );
    const reasoningParts = message.parts.filter(
        (p): p is ReasoningMessagePart => p.type === "reasoning"
    );
    const isStreaming = message.status === "pending" && text.length > 0;
    const isReasoningStreaming =
        message.status === "pending" &&
        reasoningParts.length > 0 &&
        text.length === 0;
    const isWaiting =
        message.status === "pending" &&
        text.length === 0 &&
        toolParts.length === 0 &&
        reasoningParts.length === 0;

    return (
        <div className="group w-full">
            {reasoningParts.map((part, i) => (
                <ReasoningDisplay
                    key={`reasoning-${i}`}
                    part={part}
                    isStreaming={isReasoningStreaming}
                />
            ))}

            {toolParts.map((part) => (
                <ToolInvocationDisplay
                    key={part.toolInvocationId}
                    part={part}
                />
            ))}

            {(text || isWaiting) && (
                <div>
                    {text && (
                        <MarkdownRenderer
                            content={text}
                            isStreaming={isStreaming}
                        />
                    )}
                    {isWaiting && <StreamingIndicator />}
                </div>
            )}

            {message.status === "failed" && (
                <p className="mt-1 text-xs text-red-400">Generation failed.</p>
            )}

            <div className="mt-1.5 flex items-center gap-2">
                {message.status === "complete" && text && (
                    <CopyButton text={text} />
                )}
                <AssistantMessageMetadataDisplay
                    metadata={message.metadata}
                    availableModels={availableModels}
                />
            </div>
        </div>
    );
}

interface ConversationThreadProps {
    availableModels: ChatModel[];
    conversation: ConversationDetail;
    error?: string | null;
    isSending?: boolean;
    isLoadingModels?: boolean;
    isThinkingEnabled?: boolean;
    modelsError?: string | null;
    onModelChange: (modelId: string | null) => void;
    onStop?: () => void;
    onSubmit: (
        value: string,
        attachments: ChatAttachment[]
    ) => Promise<void> | void;
    onThinkingChange?: (enabled: boolean) => void;
    selectedModelId: string | null;
}

export function ConversationThread({
    availableModels,
    conversation,
    error,
    isSending = false,
    isLoadingModels = false,
    isThinkingEnabled = false,
    modelsError = null,
    onModelChange,
    onStop,
    onThinkingChange,
    selectedModelId,
    onSubmit
}: ConversationThreadProps) {
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

        // Only trigger a re-render when the value actually changes
        setIsAtBottom((prev) =>
            prev === nextIsAtBottom ? prev : nextIsAtBottom
        );
    }, []);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        const el = scrollRef.current;
        if (!el) return;

        el.scrollTo({
            top: el.scrollHeight,
            behavior
        });

        atBottomRef.current = true;
        setIsAtBottom(true);
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [conversation.id, scrollToBottom]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const messageCount = conversation.messages.length;
        const lastMessage = conversation.messages.at(-1);
        const isNewMessage = messageCount > lastMessageCountRef.current;
        const isAssistantStreaming =
            lastMessage?.role === "assistant" &&
            lastMessage?.status === "pending";

        if ((isNewMessage || isAssistantStreaming) && atBottomRef.current) {
            scrollToBottom();
        }

        lastMessageCountRef.current = messageCount;
    }, [conversation.messages, scrollToBottom]);

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
                className="h-full overflow-y-auto px-4 pt-6 pb-48"
            >
                <div className="mx-auto max-w-3xl space-y-5">
                    {conversation.messages.map((message) => {
                        if (message.role === "user") {
                            const text = getMessageText(message.parts);
                            const images = message.parts.filter(
                                (p): p is import("../types").ImageMessagePart =>
                                    p.type === "image"
                            );
                            return (
                                <div
                                    key={message.id}
                                    className="flex justify-end"
                                >
                                    <div className="max-w-[80%]">
                                        {images.length > 0 && (
                                            <div className="flex flex-wrap justify-end gap-2 mb-1.5">
                                                {images.map((img, i) => (
                                                    <ImageViewer
                                                        key={i}
                                                        src={`data:${img.mimeType};base64,${img.data}`}
                                                        alt="attachment"
                                                        imgClassName="max-h-32 w-auto max-w-full rounded-md"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {text && (
                                            <div className="rounded-md border border-dark-500 bg-dark-800 px-3 py-0.5">
                                                <p className="whitespace-pre-wrap text-sm leading-7 text-white">
                                                    {text}
                                                </p>
                                            </div>
                                        )}
                                        {!text && images.length === 0 && (
                                            <div className="rounded-md border border-dark-500 bg-dark-800 px-3 py-0.5">
                                                <p className="whitespace-pre-wrap text-sm leading-7 text-white">
                                                    Unsupported message part.
                                                </p>
                                            </div>
                                        )}
                                        <div className="mt-1.5 flex items-center justify-end gap-2">
                                            {text && <CopyButton text={text} />}
                                            <UserMessageMetadataDisplay
                                                metadata={message.metadata}
                                                createdAt={message.createdAt}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <AssistantMessage
                                key={message.id}
                                message={message}
                                availableModels={availableModels}
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
                        backgroundColor: "var(--color-dark-900)"
                    }}
                />

                <div className="mx-auto max-w-3xl">
                    {error ? (
                        <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {error}
                        </div>
                    ) : null}

                    <div className="mb-2 flex h-8 justify-end">
                        <Button
                            type="button"
                            className={cn(
                                "h-7 px-2.5 text-xs transition-opacity text-dark-50 bg-dark-800 border border-dark-500 relative z-10",
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
                        selectedModelId={selectedModelId}
                        onSelectedModelChange={onModelChange}
                        isModelsLoading={isLoadingModels}
                        isThinkingEnabled={isThinkingEnabled}
                        modelsError={modelsError}
                        onThinkingChange={onThinkingChange}
                        showContextBadge
                        placeholder="Send a message..."
                        {...(onStop && { onStop })}
                        onSubmit={onSubmit}
                        disabled={isSending}
                        isSubmitting={isSending}
                        conversationMessages={conversation.messages}
                        panels={[
                            {
                                id: "todos",
                                label: "Todos",
                                icon: (
                                    <ListChecksIcon
                                        className="size-4"
                                        weight="bold"
                                    />
                                ),
                                content: (
                                    <div className="p-4">
                                        <p className="text-sm font-medium text-white mb-3">
                                            Todo list
                                        </p>
                                        <ul className="space-y-2 text-sm text-dark-200">
                                            <li className="flex items-center gap-2">
                                                <span className="size-3 rounded-sm border border-dark-400 inline-block shrink-0" />{" "}
                                                Build the dock panel
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="size-3 rounded-sm border border-dark-400 inline-block shrink-0" />{" "}
                                                Add real todo items here
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="size-3 rounded-sm border border-dark-400 inline-block shrink-0" />{" "}
                                                Connect to backend
                                            </li>
                                        </ul>
                                    </div>
                                )
                            },
                            {
                                id: "questions",
                                label: "Tool questions",
                                icon: (
                                    <ChatTeardropTextIcon
                                        className="size-4"
                                        weight="bold"
                                    />
                                ),
                                content: (
                                    <div className="p-4">
                                        <p className="text-sm font-medium text-white mb-3">
                                            Pending questions
                                        </p>
                                        <p className="text-sm text-dark-300">
                                            No questions from tools right now.
                                        </p>
                                    </div>
                                )
                            }
                        ]}
                    />
                </div>
            </div>
        </section>
    );
}
