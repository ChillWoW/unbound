import type {
    ChatModel,
    FileMessagePart,
    ImageMessagePart,
    MessagePart,
    ToolInvocationPart
} from "../types";

export const TODO_TOOLS = new Set([
    "todoWrite",
    "todoRead",
    "todoSetStatus",
    "todoDelete"
]);

export const SANDBOX_TOOLS = new Set([
    "pythonSandbox",
    "pythonSandboxInstallPackage",
    "pythonSandboxReset"
]);

export const MEMORY_TOOLS = new Set([
    "memorySearch",
    "memorySave",
    "memoryUpdate",
    "memoryDelete"
]);

export const COMPACT_TOOLS = new Set(["webSearch", "scrape"]);

export const TOOL_LABELS: Record<string, string> = {
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

export const TOOL_LABELS_DONE: Record<string, string> = {
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

export function createMessagePartKey(
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

export function getToolUrl(part: ToolInvocationPart): string | null {
    const source = part.state === "result" ? part.result : part.args;
    if (!source || typeof source !== "object") return null;
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

export function formatToolUrl(value: string): string {
    try {
        const url = new URL(value);
        return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
    } catch {
        return value;
    }
}

export function formatToolDurationMs(value: unknown): string | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return null;
    }
    if (value < 1000) return `${Math.round(value)} ms`;
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s`;
}

export function getSandboxTone(
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

export function getToneClasses(
    tone: "neutral" | "success" | "warning" | "danger"
): string {
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

export function formatBytes(bytes?: number): string | null {
    if (!bytes || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createAttachmentUrl(
    part: ImageMessagePart | FileMessagePart
): string {
    return `data:${part.mimeType};base64,${part.data}`;
}

export function getAttachmentName(
    part: ImageMessagePart | FileMessagePart
): string {
    return part.filename?.trim() || "attachment";
}

export function getMessageText(parts: MessagePart[]): string {
    return parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n")
        .trim();
}

export function formatTime(isoString: string): string {
    try {
        return new Date(isoString).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
        });
    } catch {
        return "";
    }
}

export function formatDuration(
    startIso: string,
    endIso: string
): string | null {
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

export function getModelDisplayName(
    modelId: string,
    availableModels: ChatModel[]
): string {
    const model = availableModels.find((m) => m.id === modelId);
    return model?.name ?? modelId.split("/").pop() ?? modelId;
}
