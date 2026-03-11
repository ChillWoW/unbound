import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
    ArrowSquareOutIcon,
    ArrowsClockwiseIcon,
    BrainIcon,
    CaretRightIcon,
    ClockIcon,
    GlobeHemisphereWestIcon,
    WarningCircleIcon
} from "@phosphor-icons/react";
import { Button, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { normalizeSafeLinkUrl } from "@/lib/safe-url";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import type {
    ChatErrorRecovery,
    ChatModel,
    CitationSource,
    ConversationMessage,
    MessageMetadata,
    ProviderType
} from "../types";
import { formatGenerationError, parseChatErrorRecovery } from "../recovery";
import { ModelSelector } from "./model-selector";
import { ToolInvocationDisplay } from "./tool-invocation";
import { ReasoningDisplay } from "./reasoning-display";
import { CopyButton, BranchNavigator } from "./message-actions";
import {
    createMessagePartKey,
    formatDuration,
    getMessageText,
    getModelDisplayName
} from "./message-utils";
import type { MessageChildrenMap } from "../utils/message-tree";

function useLiveTimer(
    startIso: string | undefined,
    isActive: boolean
): string | null {
    const [elapsed, setElapsed] = useState<string | null>(null);

    useEffect(() => {
        if (!isActive || !startIso) {
            setElapsed(null);
            return;
        }

        const update = () => {
            const start = new Date(startIso).getTime();
            const now = Date.now();
            const totalSeconds = Math.max(
                0,
                Math.round((now - start) / 1000)
            );
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            setElapsed(`${minutes}m ${seconds}s`);
        };

        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [isActive, startIso]);

    return elapsed;
}

export function StreamingIndicator({
    label = "Planning next moves"
}: {
    label?: string;
}) {
    return (
        <div className="flex items-center gap-1.5 py-1">
            <BrainIcon
                className="size-3.5 shrink-0 text-dark-200"
                weight="fill"
            />
            <span className="wave-text text-xs font-medium">{label}</span>
        </div>
    );
}

function CitationList({
    sources,
    canShow = true
}: {
    sources: CitationSource[];
    canShow?: boolean;
}) {
    const [expanded, setExpanded] = useState(false);

    if (sources.length === 0 || !canShow) return null;

    return (
        <div className="mt-3">
            <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="flex items-center gap-1.5 text-xs text-dark-300 transition-colors hover:text-dark-50"
            >
                <GlobeHemisphereWestIcon
                    className="size-3.5 shrink-0"
                    weight="bold"
                />
                <span className="font-medium">
                    {sources.length} source{sources.length !== 1 ? "s" : ""}
                </span>
                <CaretRightIcon
                    className={cn(
                        "size-3 transition-transform",
                        expanded && "rotate-90"
                    )}
                    weight="bold"
                />
            </button>

            {expanded && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {sources.map((source) => {
                        const safeUrl = normalizeSafeLinkUrl(source.url);
                        if (!safeUrl) return null;
                        return (
                            <a
                                key={source.id}
                                href={safeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
                                title={source.title}
                                className="inline-flex items-center gap-1.5 rounded-md border border-dark-600 bg-dark-850 px-3 py-0.5 text-xs text-dark-100 transition-colors hover:border-dark-500 hover:bg-dark-800 hover:text-dark-50"
                            >
                                <img
                                    src={`https://www.google.com/s2/favicons?domain=${source.host}&sz=16`}
                                    alt=""
                                    className="size-3.5 shrink-0 rounded-sm"
                                    onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                    }}
                                />
                                <span className="max-w-36 truncate">
                                    {source.host}
                                </span>
                                <ArrowSquareOutIcon
                                    className="size-3 shrink-0 text-dark-200"
                                    weight="bold"
                                />
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function AssistantMessageMetadataDisplay({
    metadata,
    availableModels,
    isPending
}: {
    metadata: MessageMetadata | null;
    availableModels: ChatModel[];
    isPending: boolean;
}) {
    const isLive = isPending && !metadata?.generationCompletedAt;
    const liveTimer = useLiveTimer(metadata?.generationStartedAt, isLive);

    if (!metadata) return null;

    const model = metadata.model
        ? getModelDisplayName(metadata.model, availableModels)
        : null;
    const duration = liveTimer
        ? liveTimer
        : metadata.generationStartedAt && metadata.generationCompletedAt
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
                <span className="flex items-center gap-1.5">
                    <BrainIcon className="size-3" weight="fill" />
                    Thinking
                </span>
            )}
            {usedThinking && duration && <span>-</span>}
            {duration && (
                <span className="flex items-center gap-1.5">
                    <ClockIcon className="size-3" weight="bold" />
                    {duration}
                </span>
            )}
        </div>
    );
}

function AssistantRecoveryActions({
    recovery,
    canRegenerate,
    onRegenerate,
    availableModels,
    configuredProviders,
    selectedModelId,
    onModelChange
}: {
    recovery: ChatErrorRecovery | null;
    canRegenerate: boolean;
    onRegenerate?: () => void;
    availableModels: ChatModel[];
    configuredProviders: ProviderType[];
    selectedModelId: string | null;
    onModelChange: (modelId: string | null, source?: ProviderType) => void;
}) {
    const navigate = useNavigate();

    if (!recovery && !canRegenerate) return null;

    return (
        <div className="mt-2 flex flex-wrap items-center gap-2">
            {recovery?.action === "open_settings" && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => navigate({ to: "/settings" })}
                >
                    Open settings
                </Button>
            )}

            {recovery?.action === "switch_model" && (
                <div className="max-w-full">
                    <ModelSelector
                        selectedModelId={selectedModelId}
                        models={availableModels}
                        configuredProviders={configuredProviders}
                        onModelSelected={(model) =>
                            onModelChange(model.id, model.source)
                        }
                    />
                </div>
            )}

            {canRegenerate && onRegenerate && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRegenerate}
                >
                    Try again
                </Button>
            )}
        </div>
    );
}

export function AssistantMessage({
    message,
    availableModels,
    configuredProviders,
    tree,
    onBranchSelect,
    onModelChange,
    onRegenerate,
    isSending,
    selectedModelId
}: {
    message: ConversationMessage;
    availableModels: ChatModel[];
    configuredProviders: ProviderType[];
    tree: MessageChildrenMap;
    onBranchSelect: (parentKey: string | null, messageId: string) => void;
    onModelChange: (modelId: string | null, source?: ProviderType) => void;
    onRegenerate?: () => void;
    isSending: boolean;
    selectedModelId: string | null;
}) {
    const text = getMessageText(message.parts);
    const isPending = message.status === "pending";
    const hasText = message.parts.some((p) => p.type === "text");
    const isWaiting = isPending && message.parts.length === 0;
    const lastPart = message.parts[message.parts.length - 1];
    const isThinkingBetweenSteps =
        isPending &&
        message.parts.length > 0 &&
        lastPart?.type === "tool-invocation" &&
        lastPart?.state === "result";
    const errorRecovery = parseChatErrorRecovery(
        message.metadata?.errorRecovery
    );
    const sources = Array.isArray(message.metadata?.sources)
        ? (message.metadata.sources as CitationSource[])
        : [];
    const lastReasoningIndex = message.parts.reduce(
        (lastIndex, part, index) =>
            part.type === "reasoning" ? index : lastIndex,
        -1
    );

    const canRegenerate =
        !!onRegenerate &&
        !isSending &&
        (message.status === "complete" || message.status === "failed") &&
        message.parentMessageId != null;

    return (
        <div className="group w-full">
            {message.parts.map((part, i) => {
                if (part.type === "reasoning") {
                    return (
                        <ReasoningDisplay
                            key={createMessagePartKey(message.id, part, i)}
                            part={part}
                            isStreaming={
                                isPending &&
                                !hasText &&
                                i === lastReasoningIndex
                            }
                        />
                    );
                }
                if (part.type === "tool-invocation") {
                    return (
                        <ToolInvocationDisplay
                            key={part.toolInvocationId}
                            part={part}
                        />
                    );
                }
                if (part.type === "text") {
                    return (
                        <MarkdownRenderer
                            key={createMessagePartKey(message.id, part, i)}
                            content={part.text}
                            isStreaming={isPending}
                        />
                    );
                }
                return null;
            })}

            {isWaiting && <StreamingIndicator />}
            {isThinkingBetweenSteps && (
                <StreamingIndicator label="Analyzing results..." />
            )}

            <CitationList
                sources={sources}
                canShow={message.status === "complete"}
            />

            {message.status === "failed" && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-red-400">
                    <WarningCircleIcon
                        className="mt-px size-3.5 shrink-0"
                        weight="fill"
                    />
                    <div>
                        <span>
                            {formatGenerationError(
                                message.metadata?.errorMessage ??
                                    message.errorMessage,
                                errorRecovery,
                                typeof message.metadata?.provider === "string"
                                    ? message.metadata.provider
                                    : undefined
                            )}
                        </span>
                        <AssistantRecoveryActions
                            recovery={errorRecovery}
                            canRegenerate={canRegenerate}
                            onRegenerate={onRegenerate}
                            availableModels={availableModels}
                            configuredProviders={configuredProviders}
                            selectedModelId={selectedModelId}
                            onModelChange={onModelChange}
                        />
                    </div>
                </div>
            )}

            <div className="mt-1.5 flex items-center gap-1.5">
                {message.status === "complete" && text && (
                    <CopyButton text={text} />
                )}
                {canRegenerate && (
                    <Tooltip content="Regenerate" side="top">
                        <button
                            type="button"
                            onClick={onRegenerate}
                            className="flex size-7 items-center justify-center rounded-md text-dark-300 transition-colors hover:bg-dark-700 hover:text-dark-50"
                        >
                            <ArrowsClockwiseIcon
                                className="size-3.5"
                                weight="bold"
                            />
                        </button>
                    </Tooltip>
                )}
                <BranchNavigator
                    tree={tree}
                    message={message}
                    onSelect={onBranchSelect}
                />
                <AssistantMessageMetadataDisplay
                    metadata={message.metadata}
                    availableModels={availableModels}
                    isPending={isPending}
                />
            </div>
        </div>
    );
}
