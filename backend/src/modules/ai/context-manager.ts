import type { ModelMessage } from "ai";
import type {
    MessagePart,
    MessageRecord
} from "../conversations/conversations.types";
import {
    estimateMessageTokens,
    calculateTokenBudget,
    DEFAULT_CONTEXT_LENGTH
} from "./token-estimator";

export interface ContextConfig {
    modelContextLength: number | null;
    thinking: boolean;
    recentWindowSize?: number;
    mediaRetentionWindow?: number;
}

export interface ContextResult {
    messages: ModelMessage[];
    estimatedTokens: number;
    truncated: boolean;
    originalMessageCount: number;
    includedMessageCount: number;
}

const DEFAULT_RECENT_WINDOW = 20;
const DEFAULT_MEDIA_RETENTION = 2;

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function safeParts(record: MessageRecord): MessagePart[] {
    const raw = record.parts;
    if (!raw || !Array.isArray(raw)) return [];
    return raw as MessagePart[];
}

// ---------------------------------------------------------------------------
// Stage 1 – Strip reasoning parts from all but the most recent assistant msg
// ---------------------------------------------------------------------------

function stripOldReasoning(records: MessageRecord[]): MessageRecord[] {
    let lastAssistantIdx = -1;
    for (let i = records.length - 1; i >= 0; i--) {
        if (records[i]!.role === "assistant") {
            lastAssistantIdx = i;
            break;
        }
    }

    return records.map((record, idx) => {
        if (record.role !== "assistant" || idx === lastAssistantIdx) {
            return record;
        }

        const parts = safeParts(record);
        const filtered = parts.filter((p) => p.type !== "reasoning");

        if (filtered.length === parts.length) return record;

        return { ...record, parts: filtered } as unknown as MessageRecord;
    });
}

// ---------------------------------------------------------------------------
// Stage 2 – Replace base64 media with text placeholders in old messages
// ---------------------------------------------------------------------------

function pruneOldMedia(
    records: MessageRecord[],
    retentionWindow: number
): MessageRecord[] {
    const retainedUserIndices = new Set<number>();
    let found = 0;
    for (let i = records.length - 1; i >= 0 && found < retentionWindow; i--) {
        if (records[i]!.role === "user") {
            retainedUserIndices.add(i);
            found++;
        }
    }

    return records.map((record, idx) => {
        if (retainedUserIndices.has(idx)) return record;

        const parts = safeParts(record);
        if (parts.length === 0) return record;

        const hasMedia = parts.some(
            (p) => p.type === "image" || p.type === "file"
        );
        if (!hasMedia) return record;

        const newParts = parts.map((p): MessagePart => {
            if (p.type === "image") {
                return {
                    type: "text" as const,
                    text: `[Attached image: ${p.filename ?? p.mimeType}]`
                };
            }
            if (p.type === "file") {
                return {
                    type: "text" as const,
                    text: `[Attached file: ${p.filename ?? p.mimeType}]`
                };
            }
            return p;
        });

        return { ...record, parts: newParts } as unknown as MessageRecord;
    });
}

// ---------------------------------------------------------------------------
// Stage 3 – Compress tool invocations in older messages to brief summaries
// ---------------------------------------------------------------------------

function summarizeToolInvocation(
    part: Extract<MessagePart, { type: "tool-invocation" }>
): string {
    const { toolName, args } = part;
    const a = args as Record<string, unknown>;

    switch (toolName) {
        case "todoWrite": {
            const count = Array.isArray(a.todos)
                ? (a.todos as unknown[]).length
                : "?";
            return `Used todoWrite (${count} items)`;
        }
        case "todoRead":
            return "Read todo list";
        case "todoSetStatus": {
            const count = Array.isArray(a.updates)
                ? (a.updates as unknown[]).length
                : "?";
            return `Updated ${count} todo status(es)`;
        }
        case "todoDelete":
            return "Deleted todo(s)";
        case "webSearch": {
            const query =
                typeof a.query === "string" ? normalizeWhitespace(a.query) : null;
            return query ? `Searched web for \"${query}\"` : "Searched the web";
        }
        case "scrape": {
            const url = typeof a.url === "string" ? a.url.trim() : null;
            return url ? `Scraped ${url}` : "Scraped a page";
        }
        case "pythonSandbox": {
            const code =
                typeof a.code === "string" ? normalizeWhitespace(a.code) : null;
            const sessionMode =
                typeof a.sessionMode === "string" ? a.sessionMode : "reuse";
            const preview = code ? truncateToolPreview(code, 80) : null;

            if (!preview) {
                return sessionMode === "reuse"
                    ? "Ran Python sandbox code"
                    : `Ran Python sandbox code (${sessionMode})`;
            }

            return sessionMode === "reuse"
                ? `Ran Python sandbox code: \"${preview}\"`
                : `Ran Python sandbox code (${sessionMode}): \"${preview}\"`;
        }
        case "pythonSandboxInstallPackage": {
            const packageName =
                typeof a.packageName === "string" ? a.packageName.trim() : null;
            return packageName
                ? `Installed Python package ${packageName}`
                : "Installed a Python package";
        }
        case "pythonSandboxReset":
            return "Reset the Python sandbox session";
        default:
            return `Used ${toolName}`;
    }
}

function truncateToolPreview(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function compressOldTools(
    records: MessageRecord[],
    recentWindow: number
): MessageRecord[] {
    const recentStart = Math.max(0, records.length - recentWindow);

    return records.map((record, idx) => {
        if (idx >= recentStart) return record;
        if (record.role !== "assistant") return record;

        const parts = safeParts(record);
        if (parts.length === 0) return record;

        const toolParts = parts.filter((p) => p.type === "tool-invocation");
        if (toolParts.length === 0) return record;

        const nonToolParts = parts.filter((p) => p.type !== "tool-invocation");
        const summaries = toolParts.map((p) =>
            summarizeToolInvocation(
                p as Extract<MessagePart, { type: "tool-invocation" }>
            )
        );

        const summaryPart: MessagePart = {
            type: "text" as const,
            text: `[Tool operations: ${summaries.join(", ")}]`
        };

        return {
            ...record,
            parts: [...nonToolParts, summaryPart]
        } as unknown as MessageRecord;
    });
}

// ---------------------------------------------------------------------------
// Stage 4+5 – Convert to model messages, estimate tokens, apply sliding window
// ---------------------------------------------------------------------------

function applyTokenBudget(
    systemMessage: ModelMessage,
    historyMessages: ModelMessage[],
    budget: number
): {
    messages: ModelMessage[];
    estimatedTokens: number;
    truncated: boolean;
    includedCount: number;
} {
    const systemTokens = estimateMessageTokens(systemMessage);
    const remaining = Math.max(0, budget - systemTokens);

    if (historyMessages.length === 0) {
        return {
            messages: [systemMessage],
            estimatedTokens: systemTokens,
            truncated: false,
            includedCount: 0
        };
    }

    const messageCosts = historyMessages.map((m) => estimateMessageTokens(m));
    const totalHistoryTokens = messageCosts.reduce((a, b) => a + b, 0);

    if (totalHistoryTokens <= remaining) {
        return {
            messages: [systemMessage, ...historyMessages],
            estimatedTokens: systemTokens + totalHistoryTokens,
            truncated: false,
            includedCount: historyMessages.length
        };
    }

    const included: { msg: ModelMessage; cost: number }[] = [];
    let usedTokens = 0;

    for (let i = historyMessages.length - 1; i >= 0; i--) {
        const cost = messageCosts[i]!;
        if (usedTokens + cost > remaining) break;
        included.unshift({ msg: historyMessages[i]!, cost });
        usedTokens += cost;
    }

    const firstMsg = historyMessages[0];
    const firstCost = messageCosts[0];
    if (
        included.length > 0 &&
        firstMsg &&
        firstCost !== undefined &&
        included[0]!.msg !== firstMsg &&
        firstMsg.role === "user" &&
        usedTokens + firstCost <= remaining
    ) {
        included.unshift({ msg: firstMsg, cost: firstCost });
        usedTokens += firstCost;
    }

    if (included.length === 0) {
        for (let i = historyMessages.length - 1; i >= 0; i--) {
            const msg = historyMessages[i]!;
            const cost = messageCosts[i]!;
            included.unshift({ msg, cost });
            usedTokens += cost;
            if (msg.role === "user") break;
        }
    }

    const truncationNotice: ModelMessage = {
        role: "system",
        content:
            "Earlier messages in this conversation were omitted to fit the context window. The conversation continues from here."
    };
    const noticeTokens = estimateMessageTokens(truncationNotice);
    usedTokens += noticeTokens;

    return {
        messages: [
            systemMessage,
            truncationNotice,
            ...included.map((i) => i.msg)
        ],
        estimatedTokens: systemTokens + usedTokens,
        truncated: true,
        includedCount: included.length
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Takes raw message records from the DB and produces an optimized
 * ModelMessage[] that fits within the model's context window.
 *
 * Pipeline stages:
 *  1. Strip reasoning from old assistant messages
 *  2. Replace base64 media in old messages with text placeholders
 *  3. Compress tool invocations in old messages to brief text summaries
 *  4. Convert to ModelMessage[] via the caller-supplied converter
 *  5. Estimate tokens and apply a sliding window to fit the budget
 */
export function buildOptimizedContext(
    records: MessageRecord[],
    systemPrompt: string,
    config: ContextConfig,
    toModelMessages: (records: MessageRecord[]) => ModelMessage[]
): ContextResult {
    const recentWindow = config.recentWindowSize ?? DEFAULT_RECENT_WINDOW;
    const mediaRetention =
        config.mediaRetentionWindow ?? DEFAULT_MEDIA_RETENTION;
    const contextLength = config.modelContextLength ?? DEFAULT_CONTEXT_LENGTH;

    const originalCount = records.length;

    // Stage 1 – strip reasoning
    let processed = stripOldReasoning(records);

    // Stage 2 – prune media
    processed = pruneOldMedia(processed, mediaRetention);

    // Stage 3 – compress old tool invocations
    processed = compressOldTools(processed, recentWindow);

    // Stage 4 – convert to model messages
    const modelMessages = toModelMessages(processed);

    // Stage 5 – token budget + sliding window
    const systemMessage: ModelMessage = {
        role: "system",
        content: systemPrompt
    };
    const budget = calculateTokenBudget(contextLength);
    const result = applyTokenBudget(systemMessage, modelMessages, budget);

    return {
        messages: result.messages,
        estimatedTokens: result.estimatedTokens,
        truncated: result.truncated,
        originalMessageCount: originalCount,
        includedMessageCount: result.includedCount
    };
}
