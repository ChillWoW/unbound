import { useCallback, useEffect, useRef, useState } from "react";
import {
    CopyIcon,
    CheckIcon,
    WrenchIcon,
    ClockIcon
} from "@phosphor-icons/react";
import { Tooltip } from "@/components/ui";
import type {
    ChatModel,
    ConversationDetail,
    ConversationMessage,
    MessageMetadata,
    MessagePart,
    ToolInvocationPart
} from "../types";
import { ChatInput, type ChatAttachment } from "./chat-input";

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

function ToolInvocationDisplay({ part }: { part: ToolInvocationPart }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="my-2 rounded-lg border border-dark-600 bg-dark-800/60">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
            >
                <WrenchIcon
                    className="size-3.5 text-primary-400"
                    weight="bold"
                />
                <span className="font-medium text-dark-100">
                    {part.toolName}
                </span>
                {part.state === "call" && (
                    <span className="ml-auto text-dark-300">Running...</span>
                )}
                {part.state === "result" && (
                    <span className="ml-auto text-green-400">Done</span>
                )}
                {part.state === "error" && (
                    <span className="ml-auto text-red-400">Error</span>
                )}
            </button>

            {expanded && (
                <div className="border-t border-dark-600 px-3 py-2 text-xs">
                    {Object.keys(part.args).length > 0 && (
                        <div className="mb-2">
                            <span className="text-dark-300">Arguments:</span>
                            <pre className="mt-1 overflow-x-auto rounded bg-dark-900 p-2 text-dark-100">
                                {JSON.stringify(part.args, null, 2)}
                            </pre>
                        </div>
                    )}
                    {part.state === "result" && part.result !== undefined && (
                        <div>
                            <span className="text-dark-300">Result:</span>
                            <pre className="mt-1 overflow-x-auto rounded bg-dark-900 p-2 text-dark-100">
                                {typeof part.result === "string"
                                    ? part.result
                                    : JSON.stringify(part.result, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
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
        } catch {
            // clipboard access denied
        }
    }, [text]);

    return (
        <Tooltip content={copied ? "Copied!" : "Copy"} side="top">
            <button
                type="button"
                onClick={handleCopy}
                className="flex size-7 items-center justify-center rounded-md text-dark-300 transition-colors hover:bg-dark-700 hover:text-white"
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
            {model && time && <span>·</span>}
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
        <div className="flex items-center gap-1.5 py-1">
            <div className="size-1.5 animate-pulse rounded-full bg-primary-400" />
            <div
                className="size-1.5 animate-pulse rounded-full bg-primary-400"
                style={{ animationDelay: "150ms" }}
            />
            <div
                className="size-1.5 animate-pulse rounded-full bg-primary-400"
                style={{ animationDelay: "300ms" }}
            />
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
    const isStreaming = message.status === "pending" && text.length > 0;
    const isWaiting =
        message.status === "pending" &&
        text.length === 0 &&
        toolParts.length === 0;

    return (
        <div className="group w-full">
            {toolParts.map((part) => (
                <ToolInvocationDisplay
                    key={part.toolInvocationId}
                    part={part}
                />
            ))}

            {(text || isWaiting) && (
                <p className="whitespace-pre-wrap text-[15px] leading-7 text-dark-100">
                    {text || null}
                    {isWaiting && <StreamingIndicator />}
                    {isStreaming && (
                        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary-400 align-middle" />
                    )}
                </p>
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
    modelsError?: string | null;
    onModelChange: (modelId: string | null) => void;
    onSubmit: (value: string, attachments: ChatAttachment[]) => Promise<void> | void;
    selectedModelId: string | null;
}

export function ConversationThread({
    availableModels,
    conversation,
    error,
    isSending = false,
    isLoadingModels = false,
    modelsError = null,
    onModelChange,
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
                                    <div className="max-w-[80%] rounded-2xl bg-dark-700 px-4 py-3 space-y-2">
                                        {images.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {images.map((img, i) => (
                                                    <img
                                                        key={i}
                                                        src={`data:${img.mimeType};base64,${img.data}`}
                                                        alt="attachment"
                                                        className="max-h-48 rounded-lg object-contain"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {text && (
                                            <p className="whitespace-pre-wrap text-[15px] leading-7 text-white">
                                                {text}
                                            </p>
                                        )}
                                        {!text && images.length === 0 && (
                                            <p className="whitespace-pre-wrap text-[15px] leading-7 text-white">
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
                        modelsError={modelsError}
                        showContextBadge
                        placeholder="Send a message..."
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
