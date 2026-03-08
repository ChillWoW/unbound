import type { ModelMessage } from "ai";

const CHARS_PER_TOKEN = 3.5;
const MESSAGE_OVERHEAD_TOKENS = 4;
const IMAGE_TOKEN_ESTIMATE = 1000;

export const RESPONSE_RESERVE_MIN = 4096;
export const RESPONSE_RESERVE_RATIO = 0.15;
export const TOOL_SCHEMA_TOKENS = 800;
export const DEFAULT_CONTEXT_LENGTH = 32_768;

export function estimateTokenCount(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function estimateContentPartTokens(part: Record<string, unknown>): number {
    switch (part.type) {
        case "text":
            return estimateTokenCount(part.text as string);
        case "image":
            return IMAGE_TOKEN_ESTIMATE;
        case "file":
            return estimateTokenCount(String(part.data ?? ""));
        case "tool-call":
            return (
                estimateTokenCount(part.toolName as string) +
                estimateTokenCount(JSON.stringify(part.input ?? {}))
            );
        case "tool-result":
            return estimateTokenCount(
                typeof part.output === "string"
                    ? part.output
                    : JSON.stringify(part.output ?? {})
            );
        default:
            return 0;
    }
}

export function estimateMessageTokens(message: ModelMessage): number {
    let tokens = MESSAGE_OVERHEAD_TOKENS;

    if (typeof message.content === "string") {
        tokens += estimateTokenCount(message.content);
    } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
            tokens += estimateContentPartTokens(
                part as Record<string, unknown>
            );
        }
    }

    return tokens;
}

export function calculateTokenBudget(modelContextLength: number): number {
    const responseReserve = Math.max(
        RESPONSE_RESERVE_MIN,
        Math.floor(modelContextLength * RESPONSE_RESERVE_RATIO)
    );

    return Math.max(0, modelContextLength - TOOL_SCHEMA_TOKENS - responseReserve);
}
