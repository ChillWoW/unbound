import { useState } from "react";
import {
    BrainIcon,
    CaretRightIcon,
    FileTextIcon,
    GlobeHemisphereWestIcon,
    ListChecksIcon,
    MagnifyingGlassIcon,
    PlugChargingIcon
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { CodeBlock } from "@/components/markdown/code-block";
import type { ToolInvocationPart } from "../types";
import {
    TODO_TOOLS,
    SANDBOX_TOOLS,
    MEMORY_TOOLS,
    COMPACT_TOOLS,
    TOOL_LABELS,
    TOOL_LABELS_DONE,
    getToolUrl,
    formatToolUrl,
    formatToolDurationMs,
    getSandboxTone,
    getToneClasses
} from "./message-utils";

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
                : PlugChargingIcon;

    return (
        <Icon className={cn("size-3.5 shrink-0", className)} weight="bold" />
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

function SandboxToolDisplay({ part }: { part: ToolInvocationPart }) {
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
                <ToolCallIcon toolName={part.toolName} className="text-dark-200" />
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

export function ToolInvocationDisplay({ part }: { part: ToolInvocationPart }) {
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
        return <SandboxToolDisplay part={part} />;
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
                {toolUrl ? (
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
