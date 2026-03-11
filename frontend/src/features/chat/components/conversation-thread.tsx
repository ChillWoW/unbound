import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
    ArrowDownIcon,
    ArrowSquareOutIcon,
    ArrowsClockwiseIcon,
    BrainIcon,
    CaretLeftIcon,
    CaretRightIcon,
    CopyIcon,
    CheckIcon,
    ClockIcon,
    GlobeHemisphereWestIcon,
    FileTextIcon,
    ListChecksIcon,
    MagnifyingGlassIcon,
    PencilSimpleIcon,
    WarningCircleIcon,
    WrenchIcon
} from "@phosphor-icons/react";
import { Button, Tooltip, ImageViewer } from "@/components/ui";
import { cn } from "@/lib/cn";
import { normalizeSafeLinkUrl } from "@/lib/safe-url";
import type {
    ChatErrorRecovery,
    ChatModel,
    ConversationDetail,
    FileMessagePart,
    ImageMessagePart,
    ConversationMessage,
    CitationSource,
    MessageMetadata,
    MessagePart,
    ProviderType,
    ReasoningMessagePart,
    ToolInvocationPart
} from "../types";
import { useChat } from "../chat-context";
import { type ChatAttachment } from "./chat-input";
import { InputDock } from "./input-dock";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { CodeBlock } from "@/components/markdown/code-block";
import {
    buildMessageTree,
    resolveActivePath,
    getSiblingInfo,
    ensureTreeStructure,
    type BranchSelections,
    type MessageChildrenMap
} from "../utils/message-tree";
import { formatGenerationError, parseChatErrorRecovery } from "../recovery";
import { ModelSelector } from "./model-selector";

const TODO_TOOLS = new Set([
    "todoWrite",
    "todoRead",
    "todoSetStatus",
    "todoDelete"
]);

const SANDBOX_TOOLS = new Set([
    "pythonSandbox",
    "pythonSandboxInstallPackage",
    "pythonSandboxReset"
]);

const EMPTY_CONFIGURED_PROVIDERS: ProviderType[] = [];

function createMessagePartKey(
    messageId: string,
    part: MessagePart,
    index: number
): string {
    if (part.type === "tool-invocation") {
        return `${messageId}-tool-${part.toolInvocationId}`;
    }

    if (part.type === "text") {
        return `${messageId}-text-${index}-${part.text.slice(0, 24)}`;
    }

    if (part.type === "reasoning") {
        return `${messageId}-reasoning-${index}-${part.text.slice(0, 24)}`;
    }

    if (part.type === "image") {
        return `${messageId}-image-${index}-${part.filename ?? part.mimeType}`;
    }

    return `${messageId}-file-${index}-${part.filename ?? part.mimeType}`;
}

const MEMORY_TOOLS = new Set([
    "memorySearch",
    "memorySave",
    "memoryUpdate",
    "memoryDelete"
]);

const COMPACT_TOOLS = new Set(["webSearch", "scrape"]);

const TOOL_LABELS: Record<string, string> = {
    todoWrite: "Updating tasks…",
    todoRead: "Reading tasks…",
    todoSetStatus: "Updating task status…",
    todoDelete: "Removing tasks...",
    memorySearch: "Checking memory...",
    memorySave: "Saving memory...",
    memoryUpdate: "Updating memory...",
    memoryDelete: "Deleting memory...",
    webSearch: "Searching the web...",
    scrape: "Scraping page...",
    pythonSandbox: "Running Python...",
    pythonSandboxInstallPackage: "Installing package...",
    pythonSandboxReset: "Resetting Python session..."
};

const TOOL_LABELS_DONE: Record<string, string> = {
    todoWrite: "Updated tasks",
    todoRead: "Read tasks",
    todoSetStatus: "Updated task status",
    todoDelete: "Removed tasks",
    memorySearch: "Checked memory",
    memorySave: "Saved memory",
    memoryUpdate: "Updated memory",
    memoryDelete: "Deleted memory",
    webSearch: "Searched the web",
    scrape: "Scraped",
    pythonSandbox: "Ran Python",
    pythonSandboxInstallPackage: "Installed package",
    pythonSandboxReset: "Reset Python session"
};

function getToolUrl(part: ToolInvocationPart): string | null {
    const source = part.state === "result" ? part.result : part.args;

    if (!source || typeof source !== "object") {
        return null;
    }

    const record = source as Record<string, unknown>;

    if (part.toolName === "webSearch") {
        const results = Array.isArray(record.results)
            ? (record.results as Array<Record<string, unknown>>)
            : [];
        const firstResult = results.find(
            (result) => typeof result.url === "string" && result.url.trim()
        );

        if (firstResult && typeof firstResult.url === "string") {
            return firstResult.url.trim();
        }
    }

    const value = record.url ?? record.proxyUrl;

    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatToolUrl(value: string): string {
    try {
        const url = new URL(value);
        return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
    } catch {
        return value;
    }
}

function formatToolDurationMs(value: unknown): string | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return null;
    }

    if (value < 1000) {
        return `${Math.round(value)} ms`;
    }

    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s`;
}

function getSandboxTone(
    status: string | null
): "neutral" | "success" | "warning" | "danger" {
    switch (status) {
        case "ok":
        case "installed":
            return "success";
        case "timeout":
            return "warning";
        case "error":
            return "danger";
        default:
            return "neutral";
    }
}

function getToneClasses(tone: "neutral" | "success" | "warning" | "danger") {
    switch (tone) {
        case "success":
            return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
        case "warning":
            return "border-amber-400/20 bg-amber-500/10 text-amber-200";
        case "danger":
            return "border-red-400/20 bg-red-500/10 text-red-200";
        default:
            return "border-dark-600 bg-dark-850 text-dark-200";
    }
}

function ToolPill({
    label,
    tone = "neutral"
}: {
    label: string;
    tone?: "neutral" | "success" | "warning" | "danger";
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                getToneClasses(tone)
            )}
        >
            {label}
        </span>
    );
}

function getSandboxResultRecord(
    part: ToolInvocationPart
): Record<string, unknown> | null {
    if (
        part.state !== "result" ||
        !part.result ||
        typeof part.result !== "object"
    ) {
        return null;
    }

    return part.result as Record<string, unknown>;
}

function SandboxToolInvocationDisplay({ part }: { part: ToolInvocationPart }) {
    const result = getSandboxResultRecord(part);
    const [expanded, setExpanded] = useState(false);
    const isPending = part.state === "call";
    const code =
        part.toolName === "pythonSandbox" && typeof part.args.code === "string"
            ? part.args.code.trim()
            : null;
    const packageName =
        typeof part.args.packageName === "string"
            ? part.args.packageName
            : typeof result?.packageName === "string"
              ? result.packageName
              : null;
    const status =
        part.state === "call"
            ? "running"
            : part.state === "error"
              ? "error"
              : typeof result?.status === "string"
                ? result.status
                : "ok";
    const tone = part.state === "call" ? "neutral" : getSandboxTone(status);
    const duration = formatToolDurationMs(result?.durationMs);
    const message =
        typeof result?.message === "string" && result.message.trim()
            ? result.message.trim()
            : null;
    const stdout =
        typeof result?.stdout === "string" && result.stdout.trim()
            ? result.stdout.trim()
            : null;
    const stderr =
        typeof result?.stderr === "string" && result.stderr.trim()
            ? result.stderr.trim()
            : null;

    const label =
        part.toolName === "pythonSandboxInstallPackage"
            ? isPending
                ? `Installing ${packageName ?? "package"}…`
                : status === "error"
                  ? `Package install failed${packageName ? `: ${packageName}` : ""}`
                  : `Installed ${packageName ?? "package"}`
            : part.toolName === "pythonSandboxReset"
              ? isPending
                  ? "Resetting Python session…"
                  : status === "error"
                    ? "Python session reset failed"
                    : "Python session reset"
              : isPending
                ? "Running Python…"
                : status === "timeout"
                  ? "Python timed out"
                  : status === "error"
                    ? "Python returned an error"
                    : "Ran Python";

    const canExpand = Boolean(code || stdout || stderr || message);

    return (
        <div className="my-1.5">
            <button
                type="button"
                onClick={() => canExpand && setExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs"
            >
                <ToolCallIcon
                    toolName={part.toolName}
                    className="text-dark-200"
                />
                <span
                    className={cn(
                        "font-medium transition-colors",
                        isPending
                            ? "wave-text"
                            : tone === "danger"
                              ? "text-red-300"
                              : tone === "warning"
                                ? "text-amber-200"
                                : "text-dark-200 hover:text-dark-50"
                    )}
                >
                    {label}
                </span>
                {duration && !isPending ? (
                    <span className="text-dark-300">{duration}</span>
                ) : null}
                {result?.truncated === true ? (
                    <ToolPill label="Truncated" tone="warning" />
                ) : null}
                {canExpand ? (
                    <CaretRightIcon
                        className={cn(
                            "size-2.5 text-dark-300 transition-transform",
                            expanded && "rotate-90"
                        )}
                        weight="bold"
                    />
                ) : null}
            </button>

            {expanded && canExpand ? (
                <div>
                    {code ? (
                        <CodeBlock language="python">{code}</CodeBlock>
                    ) : null}
                    {stdout ? (
                        <CodeBlock language="text">{stdout}</CodeBlock>
                    ) : null}
                    {stderr ? (
                        <CodeBlock language="python">{stderr}</CodeBlock>
                    ) : null}
                    {!stdout && !stderr && message ? (
                        <CodeBlock language="text">{message}</CodeBlock>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function formatBytes(bytes?: number): string | null {
    if (!bytes || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createAttachmentUrl(part: ImageMessagePart | FileMessagePart): string {
    return `data:${part.mimeType};base64,${part.data}`;
}

function getAttachmentName(part: ImageMessagePart | FileMessagePart): string {
    return part.filename?.trim() || "attachment";
}

function MessageFileCard({ part }: { part: FileMessagePart }) {
    const href = createAttachmentUrl(part);
    const size = formatBytes(part.size);

    return (
        <a
            href={href}
            download={getAttachmentName(part)}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-3 rounded-md border border-dark-600 bg-dark-850 px-2.5 py-1.5 text-left transition-colors hover:border-dark-500 hover:bg-dark-800"
        >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-dark-700 text-dark-100">
                <FileTextIcon className="size-4.5" weight="bold" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-dark-50">
                    {getAttachmentName(part)}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-dark-300">
                    <span>{part.mimeType}</span>
                    {size ? <span>{size}</span> : null}
                </div>
            </div>
            <ArrowSquareOutIcon
                className="size-4 shrink-0 text-dark-200"
                weight="bold"
            />
        </a>
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

                        if (!safeUrl) {
                            return null;
                        }

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
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
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

function ToolCallIcon({
    toolName,
    className
}: {
    toolName: string;
    className?: string;
}) {
    const Icon = TODO_TOOLS.has(toolName)
        ? ListChecksIcon
        : MEMORY_TOOLS.has(toolName)
          ? BrainIcon
        : SANDBOX_TOOLS.has(toolName)
          ? FileTextIcon
          : toolName === "webSearch"
            ? MagnifyingGlassIcon
            : toolName === "scrape"
              ? GlobeHemisphereWestIcon
              : WrenchIcon;

    return (
        <Icon className={cn("size-3.5 shrink-0", className)} weight="bold" />
    );
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

    useEffect(() => {
        if (!expanded || !isStreaming) return;

        const el = reasoningScrollRef.current;
        if (!el) return;

        const frame = requestAnimationFrame(() => {
            el.scrollTo({
                top: el.scrollHeight,
                behavior: "auto"
            });
            setIsScrolledToBottom(true);
        });

        return () => cancelAnimationFrame(frame);
    }, [expanded, isStreaming, part.text]);

    return (
        <div className="my-2">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs"
            >
                <BrainIcon
                    className="size-3.5 shrink-0 text-dark-200"
                    weight="fill"
                />
                <span
                    className={cn(
                        "font-medium transition-colors",
                        isStreaming
                            ? "wave-text"
                            : "text-dark-200 hover:text-dark-50"
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
                        style={{
                            maskImage: isScrolledToBottom
                                ? undefined
                                : "linear-gradient(to bottom, black 70%, transparent 100%)",
                            WebkitMaskImage: isScrolledToBottom
                                ? undefined
                                : "linear-gradient(to bottom, black 70%, transparent 100%)"
                        }}
                    >
                        <p className="whitespace-pre-wrap text-xs leading-5 text-dark-300">
                            {part.text}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

function ToolInvocationDisplay({ part }: { part: ToolInvocationPart }) {
    const [expanded, setExpanded] = useState(false);
    const isPending = part.state === "call";
    const isErrored = part.state === "error";
    const hasOutput = part.state === "result" && part.result !== undefined;
    const isTodoTool = TODO_TOOLS.has(part.toolName);
    const isMemoryTool = MEMORY_TOOLS.has(part.toolName);
    const isSandboxTool = SANDBOX_TOOLS.has(part.toolName);
    const isCompactTool = COMPACT_TOOLS.has(part.toolName);
    const toolUrl = getToolUrl(part);

    const label = isPending
        ? (TOOL_LABELS[part.toolName] ?? `${part.toolName}…`)
        : isErrored
          ? (TOOL_LABELS_DONE[part.toolName]?.replace(/…$/, "") ??
                part.toolName) + " (failed)"
          : (TOOL_LABELS_DONE[part.toolName] ?? part.toolName);

    if (isMemoryTool) {
        return (
            <div className="my-1.5">
                <span className="flex items-center gap-1.5 text-xs">
                    <ToolCallIcon
                        toolName={part.toolName}
                        className={cn(
                            isPending
                                ? "wave-text"
                                : isErrored
                                  ? "text-red-300"
                                  : "text-dark-200"
                        )}
                    />
                    <span
                        className={cn(
                            "font-medium transition-colors",
                            isPending
                                ? "wave-text"
                                : isErrored
                                  ? "text-red-300"
                                  : "text-dark-200 hover:text-dark-50"
                        )}
                    >
                        {label}
                    </span>
                </span>
            </div>
        );
    }

    if (isTodoTool) {
        if (isErrored) {
            const errorText =
                typeof part.result === "object" &&
                part.result !== null &&
                "error" in part.result
                    ? String((part.result as Record<string, unknown>).error)
                    : "Tool execution failed";

            return (
                <div className="my-1.5">
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1.5 text-xs"
                    >
                        <ToolCallIcon
                            toolName={part.toolName}
                            className="text-dark-200"
                        />
                        <span className="font-medium text-dark-200 hover:text-dark-50 transition-colors">
                            {label}
                        </span>
                        <CaretRightIcon
                            className={cn(
                                "size-2.5 text-dark-200 transition-transform",
                                expanded && "rotate-90"
                            )}
                            weight="bold"
                        />
                    </button>
                    {expanded && (
                        <pre className="mt-2 overflow-x-auto rounded bg-dark-900 p-2 text-xs text-dark-200">
                            {errorText}
                        </pre>
                    )}
                </div>
            );
        }

        return (
            <div className="my-1.5">
                <span className="flex items-center gap-1.5 text-xs">
                    <ToolCallIcon
                        toolName={part.toolName}
                        className={cn(
                            isPending ? "wave-text" : "text-dark-200"
                        )}
                    />
                    <span
                        className={cn(
                            "font-medium transition-colors",
                            isPending
                                ? "wave-text"
                                : "text-dark-200 hover:text-dark-50"
                        )}
                    >
                        {label}
                    </span>
                </span>
            </div>
        );
    }

    if (isSandboxTool) {
        return <SandboxToolInvocationDisplay part={part} />;
    }

    if (isCompactTool) {
        return (
            <div className="my-1.5 flex items-center gap-2 text-xs text-dark-200">
                <ToolCallIcon
                    toolName={part.toolName}
                    className={cn(
                        isPending
                            ? "wave-text"
                            : isErrored
                              ? "text-red-300"
                              : "text-dark-200"
                    )}
                />
                <span
                    className={cn(
                        "font-medium transition-colors",
                        isPending
                            ? "wave-text"
                            : isErrored
                              ? "text-red-300"
                              : "text-dark-200 hover:text-dark-50"
                    )}
                >
                    {label}
                </span>
                {part.toolName === "webSearch" && toolUrl ? (
                    <span className="truncate text-dark-300">
                        {formatToolUrl(toolUrl)}
                    </span>
                ) : null}
                {part.toolName === "scrape" && toolUrl ? (
                    <span className="truncate text-dark-300">
                        {formatToolUrl(toolUrl)}
                    </span>
                ) : null}
            </div>
        );
    }

    return (
        <div className="my-1.5">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs"
            >
                <ToolCallIcon
                    toolName={part.toolName}
                    className={cn(isPending ? "wave-text" : "text-dark-200")}
                />
                <span
                    className={cn(
                        "font-medium transition-colors",
                        isPending
                            ? "wave-text"
                            : "text-dark-200 hover:text-dark-50"
                    )}
                >
                    {label}
                </span>
                <CaretRightIcon
                    className={cn(
                        "size-2.5 text-dark-200 transition-transform",
                        expanded && "rotate-90"
                    )}
                    weight="bold"
                />
            </button>
            {expanded && hasOutput && (
                <pre className="mt-2 overflow-x-auto rounded bg-dark-900 p-2 text-xs text-dark-200">
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
                className="flex size-7 items-center justify-center rounded-md text-dark-300 transition-colors hover:bg-dark-700 hover:text-dark-50"
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

function BranchNavigator({
    tree,
    message,
    onSelect
}: {
    tree: MessageChildrenMap;
    message: ConversationMessage;
    onSelect: (parentKey: string | null, messageId: string) => void;
}) {
    const { siblings, activeIndex, total } = getSiblingInfo(tree, message);

    if (total <= 1) return null;

    const canGoLeft = activeIndex > 0;
    const canGoRight = activeIndex < total - 1;
    const parentKey = message.parentMessageId ?? null;

    return (
        <div className="flex items-center gap-0.5 text-[11px] text-dark-300">
            <button
                type="button"
                disabled={!canGoLeft}
                onClick={() =>
                    canGoLeft &&
                    onSelect(parentKey, siblings[activeIndex - 1].id)
                }
                className="flex size-5 items-center justify-center rounded-md transition-colors hover:text-dark-50 disabled:opacity-30 disabled:hover:text-dark-300"
            >
                <CaretLeftIcon className="size-3" weight="bold" />
            </button>
            <span className="tabular-nums min-w-[2ch] text-center">
                {activeIndex + 1}/{total}
            </span>
            <button
                type="button"
                disabled={!canGoRight}
                onClick={() =>
                    canGoRight &&
                    onSelect(parentKey, siblings[activeIndex + 1].id)
                }
                className="flex size-5 items-center justify-center rounded transition-colors hover:text-dark-50 disabled:opacity-30 disabled:hover:text-dark-300"
            >
                <CaretRightIcon className="size-3" weight="bold" />
            </button>
        </div>
    );
}

function InlineEditForm({
    initialText,
    onSave,
    onCancel,
    isSending
}: {
    initialText: string;
    onSave: (text: string) => void;
    onCancel: () => void;
    isSending: boolean;
}) {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = textareaRef.current;
        if (el) {
            setText(el.value);
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        }
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (text.trim()) onSave(text.trim());
        }
        if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div className="w-full">
            <textarea
                ref={textareaRef}
                defaultValue={initialText}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                rows={Math.min(12, Math.max(2, text.split("\n").length))}
                className="w-full resize-none rounded-md border border-dark-600 bg-dark-900 px-3 py-2 text-sm leading-6 text-dark-50 outline-none focus:border-primary-500"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                    variant="ghost"
                    onClick={onCancel}
                    disabled={isSending}
                    className="text-dark-200 hover:text-dark-50"
                    size="sm"
                >
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    onClick={() => text.trim() && onSave(text.trim())}
                    disabled={isSending || !text.trim()}
                    size="sm"
                >
                    Save & Submit
                </Button>
            </div>
        </div>
    );
}

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
            const totalSeconds = Math.max(0, Math.round((now - start) / 1000));
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
        <div className="flex items-center gap-1.5 text-[11px] text-dark-300">
            <ClockIcon className="size-3" weight="bold" />
            <span>{time}</span>
        </div>
    );
}

function StreamingIndicator({ label = "Planning next moves" }: { label?: string }) {
    return (
        <div className="flex items-center gap-1.5 py-1">
            <BrainIcon
                className="size-3.5 shrink-0 text-dark-200"
                weight="fill"
            />
            <span className="wave-text text-xs font-medium">
                {label}
            </span>
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

function AssistantMessage({
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
            {isThinkingBetweenSteps && <StreamingIndicator label="Analyzing results..." />}

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

interface ConversationThreadProps {
    availableModels: ChatModel[];
    configuredProviders?: ProviderType[];
    conversation: ConversationDetail;
    error?: string | null;
    isSending?: boolean;
    isLoadingModels?: boolean;
    isThinkingEnabled?: boolean;
    modelsError?: string | null;
    modelsErrorRecovery?: ChatErrorRecovery | null;
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
    isThinkingEnabled = false,
    modelsError = null,
    modelsErrorRecovery = null,
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
                            const text = getMessageText(message.parts);
                            const images = message.parts.filter(
                                (p): p is ImageMessagePart => p.type === "image"
                            );
                            const files = message.parts.filter(
                                (p): p is FileMessagePart => p.type === "file"
                            );
                            const isEditing = editingMessageId === message.id;

                            return (
                                <div
                                    key={message.id}
                                    className="flex justify-end"
                                >
                                    <div
                                        className={cn(
                                            isEditing
                                                ? "w-full max-w-[85%]"
                                                : "max-w-[75%]"
                                        )}
                                    >
                                        {isEditing ? (
                                            <InlineEditForm
                                                initialText={text ?? ""}
                                                onSave={(newText) =>
                                                    handleEditSave(
                                                        message.id,
                                                        newText
                                                    )
                                                }
                                                onCancel={() =>
                                                    setEditingMessageId(null)
                                                }
                                                isSending={isSending}
                                            />
                                        ) : (
                                            <>
                                                {images.length > 0 && (
                                                    <div className="flex flex-wrap justify-end gap-2.5 mb-1">
                                                        {images.map(
                                                            (img, i) => (
                                                                <ImageViewer
                                                                    key={createMessagePartKey(
                                                                        message.id,
                                                                        img,
                                                                        i
                                                                    )}
                                                                    src={createAttachmentUrl(
                                                                        img
                                                                    )}
                                                                    alt={getAttachmentName(
                                                                        img
                                                                    )}
                                                                    imgClassName="max-h-32 w-auto max-w-full rounded-md"
                                                                />
                                                            )
                                                        )}
                                                    </div>
                                                )}
                                                {files.length > 0 && (
                                                    <div className="mb-1 space-y-2">
                                                        {files.map(
                                                            (file, index) => (
                                                                <MessageFileCard
                                                                    key={createMessagePartKey(
                                                                        message.id,
                                                                        file,
                                                                        index
                                                                    )}
                                                                    part={file}
                                                                />
                                                            )
                                                        )}
                                                    </div>
                                                )}
                                                {text && (
                                                    <div className="rounded-md border border-dark-600 bg-dark-850 px-3 py-0.5">
                                                        <p className="whitespace-pre-wrap text-sm leading-6 text-dark-50">
                                                            {text}
                                                        </p>
                                                    </div>
                                                )}
                                                {!text &&
                                                    images.length === 0 &&
                                                    files.length === 0 && (
                                                        <div className="rounded-md border border-dark-600 bg-dark-850 px-3 py-0.5">
                                                            <p className="whitespace-pre-wrap text-sm leading-6 text-dark-50">
                                                                Unsupported
                                                                message part.
                                                            </p>
                                                        </div>
                                                    )}
                                                <div className="mt-1.5 flex items-center justify-end gap-1.5">
                                                    {text && (
                                                        <CopyButton
                                                            text={text}
                                                        />
                                                    )}
                                                    {!isSending && text && (
                                                        <Tooltip
                                                            content="Edit"
                                                            side="top"
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setEditingMessageId(
                                                                        message.id
                                                                    )
                                                                }
                                                                className="flex size-7 items-center justify-center rounded-md text-dark-300 transition-colors hover:bg-dark-700 hover:text-dark-50"
                                                            >
                                                                <PencilSimpleIcon
                                                                    className="size-3.5"
                                                                    weight="bold"
                                                                />
                                                            </button>
                                                        </Tooltip>
                                                    )}
                                                    <BranchNavigator
                                                        tree={tree}
                                                        message={message}
                                                        onSelect={
                                                            handleBranchSelect
                                                        }
                                                    />
                                                    <UserMessageMetadataDisplay
                                                        metadata={
                                                            message.metadata
                                                        }
                                                        createdAt={
                                                            message.createdAt
                                                        }
                                                    />
                                                </div>
                                            </>
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
                        isThinkingEnabled={isThinkingEnabled}
                        modelsError={modelsError}
                        modelsErrorRecovery={modelsErrorRecovery}
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
