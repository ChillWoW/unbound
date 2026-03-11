import { ApiError } from "@/lib/api";
import type {
    ChatErrorRecovery,
    ChatRecoveryAction,
    ProviderType
} from "./types";

const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    kimi: "Kimi"
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

function isRecoveryAction(value: unknown): value is ChatRecoveryAction {
    return (
        value === "open_settings" ||
        value === "switch_model" ||
        value === "retry"
    );
}

export function getProviderDisplayName(provider?: string): string {
    if (!provider) return "your provider";
    if (provider in PROVIDER_DISPLAY_NAMES) {
        return PROVIDER_DISPLAY_NAMES[provider as ProviderType];
    }
    return provider;
}

export function parseChatErrorRecovery(
    value: unknown
): ChatErrorRecovery | null {
    if (!isRecord(value)) return null;
    if (typeof value.code !== "string") return null;
    if (!isRecoveryAction(value.action)) return null;
    if (typeof value.message !== "string" || value.message.length === 0) {
        return null;
    }
    if (typeof value.retryable !== "boolean") return null;

    return {
        code: value.code as ChatErrorRecovery["code"],
        action: value.action,
        message: value.message,
        retryable: value.retryable,
        provider:
            typeof value.provider === "string"
                ? (value.provider as ProviderType)
                : undefined
    };
}

export function getApiErrorRecovery(error: unknown): ChatErrorRecovery | null {
    if (
        error instanceof ApiError &&
        typeof error.data === "object" &&
        error.data
    ) {
        return parseChatErrorRecovery((error.data as Record<string, unknown>).recovery);
    }

    return null;
}

export function formatGenerationError(
    raw: string | undefined,
    recovery?: ChatErrorRecovery | null,
    provider?: string
): string {
    if (recovery?.message) return recovery.message;
    if (!raw) return "Generation failed. Please try again.";

    const providerName = getProviderDisplayName(provider);
    const lower = raw.toLowerCase();

    if (
        lower.includes("api key") ||
        lower.includes("unauthorized") ||
        lower.includes("401")
    ) {
        return `Invalid or missing API key. Check your ${providerName} key in settings.`;
    }
    if (
        lower.includes("rate limit") ||
        lower.includes("rate-limit") ||
        lower.includes("rate limited") ||
        lower.includes("rate-limited") ||
        lower.includes("429")
    ) {
        return "Rate limit reached. Wait a moment, then try again.";
    }
    if (
        lower.includes("quota") ||
        lower.includes("insufficient") ||
        lower.includes("credits") ||
        lower.includes("balance")
    ) {
        return `Insufficient credits or quota on your ${providerName} account.`;
    }
    if (
        lower.includes("context length") ||
        lower.includes("too long") ||
        lower.includes("maximum context")
    ) {
        return "The conversation is too long for this model. Start a new conversation or switch to a model with a larger context window.";
    }
    if (
        lower.includes("model") &&
        (lower.includes("not found") ||
            lower.includes("unavailable") ||
            lower.includes("404"))
    ) {
        return "The selected model is unavailable. Try a different model.";
    }
    if (lower.includes("timeout") || lower.includes("timed out")) {
        return "The request timed out. Please try again.";
    }
    if (
        lower.includes("no response body") ||
        lower.includes("fetch") ||
        lower.includes("network") ||
        lower.includes("connection")
    ) {
        return "Connection failed. Check your internet and try again.";
    }

    return "Generation failed. Please try again.";
}
