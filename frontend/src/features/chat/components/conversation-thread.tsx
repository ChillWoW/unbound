import { useCallback, useEffect, useRef, useState } from "react";
import {
    CaretRightIcon,
    CopyIcon,
    CheckIcon,
    ClockIcon
} from "@phosphor-icons/react";
import { Tooltip } from "@/components/ui";
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
import { ChatInput, type ChatAttachment } from "./chat-input";
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

function getModelDisplayName(
    modelId: string,
    availableModels: ChatModel[]
): string {
    const model = availableModels.find((m) => m.id === modelId);
    return model?.name ?? modelId.split("/").pop() ?? modelId;
}

function ReasoningDisplay({ part, isStreaming }: { part: ReasoningMessagePart; isStreaming: boolean }) {
    const [expanded, setExpanded] = useState(true);

    useEffect(() => {
        if (!isStreaming) setExpanded(false);
    }, [isStreaming]);

    return (
        <div className="my-2">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs"
            >
                <span className={cn("font-medium", isStreaming ? "wave-text" : "text-dark-300")}>
                    Thinking
                </span>
                <CaretRightIcon
                    className={cn(
                        "size-3 text-dark-300 transition-transform",
                        expanded && "rotate-90"
                    )}
                    weight="bold"
                />
            </button>
            {expanded && (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-dark-300">
                    {part.text}
                </p>
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
                <span className={cn("font-medium", isPending ? "wave-text" : "text-dark-300")}>
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

function MessageMetadataDisplay({
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
    const time = metadata.generationStartedAt
        ? formatTime(metadata.generationStartedAt)
        : null;

    if (!model && !time) return null;

    return (
        <div className="flex items-center gap-2 text-[11px] text-dark-300">
            {model && <span>{model}</span>}
            {model && time && <span>-</span>}
            {time && (
                <span className="flex items-center gap-1">
                    <ClockIcon className="size-3" weight="bold" />
                    {time}
                </span>
            )}
        </div>
    );
}

function StreamingIndicator() {
    return (
        <div className="py-1">
            <span className="wave-text text-xs font-medium">Thinking</span>
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
        message.status === "pending" && reasoningParts.length > 0 && text.length === 0;
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
                <MessageMetadataDisplay
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
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastMessageCountRef = useRef(0);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const messageCount = conversation.messages.length;
        const lastMessage = conversation.messages.at(-1);
        const isNewMessage = messageCount > lastMessageCountRef.current;
        const isAssistantStreaming =
            lastMessage?.role === "assistant" &&
            lastMessage?.status === "pending";

        if (isNewMessage || isAssistantStreaming) {
            el.scrollTop = el.scrollHeight;
        }

        lastMessageCountRef.current = messageCount;
    });

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
                                    <div className="max-w-[80%] rounded-md bg-dark-800 border border-dark-600 px-3 py-0.5 space-y-2">
                                        {images.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {images.map((img, i) => (
                                                    <img
                                                        key={i}
                                                        src={`data:${img.mimeType};base64,${img.data}`}
                                                        alt="attachment"
                                                        className="max-h-48 rounded-md object-contain"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {text && (
                                            <p className="whitespace-pre-wrap text-sm leading-7 text-white">
                                                {text}
                                            </p>
                                        )}
                                        {!text && images.length === 0 && (
                                            <p className="whitespace-pre-wrap text-sm leading-7 text-white">
                                                Unsupported message part.
                                            </p>
                                        )}
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

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-dark-900 via-dark-900/90 to-transparent px-4 pb-4">
                <div className="mx-auto max-w-3xl">
                    {error ? (
                        <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {error}
                        </div>
                    ) : null}

                    <ChatInput
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
                    />
                </div>
            </div>
        </section>
    );
}
