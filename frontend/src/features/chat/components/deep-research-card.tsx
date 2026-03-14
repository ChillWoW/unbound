import { useEffect, useMemo, useState } from "react";
import {
    ArrowSquareOutIcon,
    CaretRightIcon,
    CheckCircleIcon,
    ClockIcon,
    CompassIcon,
    CopyIcon,
    FileTextIcon,
    GlobeHemisphereWestIcon,
    MagnifyingGlassIcon,
    SpinnerGapIcon
} from "@phosphor-icons/react";
import { Button, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { normalizeSafeLinkUrl } from "@/lib/safe-url";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import type {
    ChatModel,
    CitationSource,
    ConversationMessage,
    MessagePart,
    ToolInvocationPart
} from "../types";
import { getMessageText, getModelDisplayName } from "./message-utils";

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

function formatDuration(startIso: string, endIso: string): string | null {
    try {
        const start = new Date(startIso).getTime();
        const end = new Date(endIso).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
            return null;
        const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds}s`;
    } catch {
        return null;
    }
}

interface ActivityStep {
    id: string;
    type: "search" | "scrape" | "tool";
    label: string;
    detail?: string;
    state: "pending" | "done" | "error";
}

function extractActivitySteps(parts: MessagePart[]): ActivityStep[] {
    const steps: ActivityStep[] = [];

    for (const part of parts) {
        if (part.type !== "tool-invocation") continue;
        const tool = part as ToolInvocationPart;

        if (tool.toolName === "webSearch") {
            const query =
                typeof tool.args.query === "string"
                    ? tool.args.query
                    : undefined;
            steps.push({
                id: tool.toolInvocationId,
                type: "search",
                label:
                    tool.state === "call"
                        ? `Searching "${query ?? "..."}"`
                        : `Searched "${query ?? "..."}"`,
                detail: query,
                state:
                    tool.state === "call"
                        ? "pending"
                        : tool.state === "error"
                          ? "error"
                          : "done"
            });
        } else if (tool.toolName === "scrape") {
            const url =
                typeof tool.args.url === "string" ? tool.args.url : undefined;
            let host = url;
            if (url) {
                try {
                    host = new URL(
                        url.startsWith("http") ? url : `https://${url}`
                    ).hostname;
                } catch {
                    /* keep raw */
                }
            }
            steps.push({
                id: tool.toolInvocationId,
                type: "scrape",
                label:
                    tool.state === "call"
                        ? `Reading ${host ?? "page"}...`
                        : `Read ${host ?? "page"}`,
                detail: host,
                state:
                    tool.state === "call"
                        ? "pending"
                        : tool.state === "error"
                          ? "error"
                          : "done"
            });
        } else if (
            tool.toolName !== "todoWrite" &&
            tool.toolName !== "todoRead" &&
            tool.toolName !== "todoSetStatus" &&
            tool.toolName !== "todoDelete"
        ) {
            steps.push({
                id: tool.toolInvocationId,
                type: "tool",
                label: tool.toolName,
                state:
                    tool.state === "call"
                        ? "pending"
                        : tool.state === "error"
                          ? "error"
                          : "done"
            });
        }
    }

    return steps;
}

function extractSources(parts: MessagePart[]): CitationSource[] {
    const seen = new Map<string, CitationSource>();

    for (const part of parts) {
        if (part.type !== "tool-invocation" || part.state !== "result")
            continue;
        const tool = part as ToolInvocationPart;
        const result = tool.result as Record<string, unknown> | undefined;
        if (!result) continue;

        if (tool.toolName === "webSearch" && Array.isArray(result.results)) {
            for (const entry of result.results as Array<
                Record<string, unknown>
            >) {
                const url =
                    typeof entry.url === "string" ? entry.url.trim() : null;
                if (!url) continue;
                const safe = normalizeSafeLinkUrl(url);
                if (!safe) continue;
                const title =
                    typeof entry.title === "string" && entry.title.trim()
                        ? entry.title.trim()
                        : safe;
                let host = safe;
                try {
                    host = new URL(safe).hostname;
                } catch {
                    /* keep full */
                }
                if (!seen.has(safe)) {
                    seen.set(safe, {
                        id: `ws-${safe}`,
                        title,
                        url: safe,
                        host,
                        sourceType: "web"
                    });
                }
            }
        }

        if (tool.toolName === "scrape") {
            const rawUrl = result.url ?? result.proxyUrl;
            const url =
                typeof rawUrl === "string" ? rawUrl.trim() : null;
            if (!url) continue;
            const safe = normalizeSafeLinkUrl(url);
            if (!safe || seen.has(safe)) continue;
            let host = safe;
            try {
                host = new URL(safe).hostname;
            } catch {
                /* keep full */
            }
            seen.set(safe, {
                id: `sc-${safe}`,
                title: host,
                url: safe,
                host,
                sourceType: "web"
            });
        }
    }

    return [...seen.values()];
}

function ActivityLog({ steps }: { steps: ActivityStep[] }) {
    const [expanded, setExpanded] = useState(true);
    const pendingCount = steps.filter((s) => s.state === "pending").length;
    const doneCount = steps.filter((s) => s.state === "done").length;

    if (steps.length === 0) return null;

    return (
        <div className="border-t border-dark-700 px-4 py-3">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center gap-2 text-xs font-medium text-dark-200 transition-colors hover:text-dark-50"
            >
                <CaretRightIcon
                    className={cn(
                        "size-3 shrink-0 transition-transform",
                        expanded && "rotate-90"
                    )}
                    weight="bold"
                />
                <span>
                    Activity{" "}
                    <span className="text-dark-300">
                        ({doneCount} done
                        {pendingCount > 0 ? `, ${pendingCount} running` : ""})
                    </span>
                </span>
            </button>

            {expanded && (
                <div className="mt-2 ml-1 flex flex-col gap-1.5">
                    {steps.map((step) => (
                        <div
                            key={step.id}
                            className="flex items-center gap-2 text-xs"
                        >
                            {step.state === "pending" ? (
                                <SpinnerGapIcon
                                    className="size-3 shrink-0 animate-spin text-primary-400"
                                    weight="bold"
                                />
                            ) : step.state === "error" ? (
                                <span className="size-3 shrink-0 text-red-400">
                                    &times;
                                </span>
                            ) : (
                                <CheckCircleIcon
                                    className="size-3 shrink-0 text-emerald-400"
                                    weight="fill"
                                />
                            )}
                            {step.type === "search" ? (
                                <MagnifyingGlassIcon
                                    className="size-3 shrink-0 text-dark-300"
                                    weight="bold"
                                />
                            ) : step.type === "scrape" ? (
                                <GlobeHemisphereWestIcon
                                    className="size-3 shrink-0 text-dark-300"
                                    weight="bold"
                                />
                            ) : null}
                            <span
                                className={cn(
                                    "truncate",
                                    step.state === "pending"
                                        ? "text-dark-100"
                                        : "text-dark-300"
                                )}
                            >
                                {step.label}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SourcesGrid({ sources }: { sources: CitationSource[] }) {
    const [expanded, setExpanded] = useState(false);

    if (sources.length === 0) return null;

    return (
        <div className="border-t border-dark-700 px-4 py-3">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center gap-2 text-xs font-medium text-dark-200 transition-colors hover:text-dark-50"
            >
                <CaretRightIcon
                    className={cn(
                        "size-3 shrink-0 transition-transform",
                        expanded && "rotate-90"
                    )}
                    weight="bold"
                />
                <GlobeHemisphereWestIcon
                    className="size-3 shrink-0"
                    weight="bold"
                />
                <span>
                    {sources.length} source{sources.length !== 1 ? "s" : ""}{" "}
                    found
                </span>
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
                                className="inline-flex items-center gap-1.5 rounded-md border border-dark-600 bg-dark-850 px-2.5 py-1 text-xs text-dark-100 transition-colors hover:border-dark-500 hover:bg-dark-800 hover:text-dark-50"
                            >
                                <img
                                    src={`https://www.google.com/s2/favicons?domain=${source.host}&sz=16`}
                                    alt=""
                                    className="size-3.5 shrink-0 rounded-sm"
                                    onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                    }}
                                />
                                <span className="max-w-32 truncate">
                                    {source.host}
                                </span>
                                <ArrowSquareOutIcon
                                    className="size-3 shrink-0 text-dark-300"
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

function ExportBar({
    reportText,
    title
}: {
    reportText: string;
    title?: string;
}) {
    const [copied, setCopied] = useState(false);

    async function copyMarkdown() {
        try {
            await navigator.clipboard.writeText(reportText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard may not be available */
        }
    }

    function exportPdf() {
        const win = window.open("", "_blank");
        if (!win) return;

        const escapedTitle = (title ?? "Research Report").replace(
            /[<>&"]/g,
            (c) =>
                ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[
                    c
                ] ?? c
        );

        win.document.write(`<!DOCTYPE html>
<html><head>
<title>${escapedTitle}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
h1 { font-size: 1.6em; border-bottom: 1px solid #ddd; padding-bottom: 0.4em; }
h2 { font-size: 1.3em; margin-top: 1.5em; }
h3 { font-size: 1.1em; margin-top: 1.2em; }
a { color: #2563eb; }
code { background: #f3f4f6; padding: 0.15em 0.35em; border-radius: 3px; font-size: 0.9em; }
pre { background: #f3f4f6; padding: 1em; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #d1d5db; padding: 0.5em 0.75em; text-align: left; }
th { background: #f9fafb; }
blockquote { border-left: 3px solid #d1d5db; margin: 1em 0; padding: 0.5em 1em; color: #4b5563; }
@media print { body { margin: 0; padding: 20px; } }
</style>
</head><body>
<div id="content">${reportText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<script>document.getElementById("content").innerHTML = marked.parse(document.getElementById("content").textContent);<\/script>
</body></html>`);
        win.document.close();
        setTimeout(() => win.print(), 600);
    }

    if (!reportText) return null;

    return (
        <div className="flex items-center gap-2 border-t border-dark-700 px-4 py-3">
            <Tooltip content={copied ? "Copied!" : "Copy as Markdown"}>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyMarkdown}
                    className="gap-1.5"
                >
                    <CopyIcon className="size-3.5" weight="bold" />
                    {copied ? "Copied" : "Copy Markdown"}
                </Button>
            </Tooltip>
            <Tooltip content="Export as PDF">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={exportPdf}
                    className="gap-1.5"
                >
                    <FileTextIcon className="size-3.5" weight="bold" />
                    Export PDF
                </Button>
            </Tooltip>
        </div>
    );
}

export function DeepResearchCard({
    message,
    availableModels
}: {
    message: ConversationMessage;
    availableModels: ChatModel[];
}) {
    const isPending = message.status === "pending";
    const metadata = message.metadata;
    const isLive = isPending && !metadata?.generationCompletedAt;
    const liveTimer = useLiveTimer(metadata?.generationStartedAt, isLive);

    const duration = liveTimer
        ? liveTimer
        : metadata?.generationStartedAt && metadata?.generationCompletedAt
          ? formatDuration(
                metadata.generationStartedAt,
                metadata.generationCompletedAt
            )
          : null;

    const model = metadata?.model
        ? getModelDisplayName(metadata.model, availableModels)
        : null;

    const activitySteps = useMemo(
        () => extractActivitySteps(message.parts),
        [message.parts]
    );

    const sources = useMemo(() => {
        const fromParts = extractSources(message.parts);
        const fromMeta = Array.isArray(metadata?.sources)
            ? (metadata.sources as CitationSource[])
            : [];
        const merged = new Map<string, CitationSource>();
        for (const s of [...fromParts, ...fromMeta]) merged.set(s.url, s);
        return [...merged.values()];
    }, [message.parts, metadata?.sources]);

    const reportText = getMessageText(message.parts);
    const hasReport = reportText.length > 0;
    const isComplete = message.status === "complete";

    return (
        <div className="my-2 overflow-hidden rounded-lg border border-dark-600 bg-dark-900">
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                    <CompassIcon
                        className="size-4 text-primary-400"
                        weight="fill"
                    />
                    <span className="text-sm font-semibold text-white">
                        Deep Research
                    </span>
                    {isPending && (
                        <span className="wave-text text-xs text-dark-300">
                            Researching...
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-dark-300">
                    {model && <span>{model}</span>}
                    {model && duration && <span>-</span>}
                    {duration && (
                        <span className="flex items-center gap-1">
                            <ClockIcon className="size-3" weight="bold" />
                            {duration}
                        </span>
                    )}
                </div>
            </div>

            <ActivityLog steps={activitySteps} />

            <SourcesGrid sources={sources} />

            {hasReport && (
                <div className="border-t border-dark-700 px-4 py-4">
                    <MarkdownRenderer
                        content={reportText}
                        isStreaming={isPending}
                    />
                </div>
            )}

            {!hasReport && isPending && (
                <div className="border-t border-dark-700 px-4 py-4">
                    <div className="flex items-center gap-2 text-xs text-dark-200">
                        <SpinnerGapIcon
                            className="size-3.5 animate-spin"
                            weight="bold"
                        />
                        <span>Gathering information...</span>
                    </div>
                </div>
            )}

            {message.status === "failed" && (
                <div className="border-t border-dark-700 px-4 py-3 text-xs text-red-400">
                    {metadata?.errorMessage ?? "Research failed."}
                </div>
            )}

            {isComplete && <ExportBar reportText={reportText} />}
        </div>
    );
}
