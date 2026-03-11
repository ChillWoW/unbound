import type { ProviderType } from "../../lib/provider-registry";
import { ConversationError } from "../conversations/conversations.types";

export type AIRecoveryCode =
    | "missing_api_key"
    | "invalid_api_key"
    | "rate_limited"
    | "insufficient_quota"
    | "model_unavailable"
    | "context_length_exceeded"
    | "request_timeout"
    | "network_error";

export type AIRecoveryAction = "open_settings" | "switch_model" | "retry";

export interface AIRecoveryInfo {
    code: AIRecoveryCode;
    action: AIRecoveryAction;
    message: string;
    provider?: ProviderType;
    retryable: boolean;
}

const PROVIDER_LABELS: Record<ProviderType, string> = {
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    kimi: "Kimi"
};

export class AIGenerationError extends ConversationError {
    readonly recovery?: AIRecoveryInfo;
    readonly assistantMessageId?: string;

    constructor(
        status: number,
        message: string,
        options: {
            recovery?: AIRecoveryInfo;
            assistantMessageId?: string;
        } = {}
    ) {
        super(status, message);
        this.name = "AIGenerationError";
        this.recovery = options.recovery;
        this.assistantMessageId = options.assistantMessageId;
    }
}

function getProviderLabel(provider?: ProviderType): string {
    if (!provider) return "your provider";
    return PROVIDER_LABELS[provider] ?? provider;
}

export function createMissingApiKeyRecovery(
    provider: ProviderType
): AIRecoveryInfo {
    return {
        code: "missing_api_key",
        action: "open_settings",
        message: `Add your ${getProviderLabel(provider)} API key in settings to use this model.`,
        provider,
        retryable: false
    };
}

export function inferAIRecovery(
    raw: string | undefined,
    provider?: ProviderType
): AIRecoveryInfo | null {
    if (!raw) return null;

    const lower = raw.toLowerCase();
    const providerLabel = getProviderLabel(provider);

    if (
        lower.includes("api key") ||
        lower.includes("unauthorized") ||
        lower.includes("401")
    ) {
        return {
            code: "invalid_api_key",
            action: "open_settings",
            message: `Invalid or expired ${providerLabel} API key. Update it in settings and try again.`,
            provider,
            retryable: false
        };
    }

    if (
        lower.includes("rate limit") ||
        lower.includes("rate-limit") ||
        lower.includes("rate limited") ||
        lower.includes("rate-limited") ||
        lower.includes("429")
    ) {
        return {
            code: "rate_limited",
            action: "retry",
            message: "Rate limit reached. Wait a moment, then try again.",
            provider,
            retryable: true
        };
    }

    if (
        lower.includes("quota") ||
        lower.includes("insufficient") ||
        lower.includes("credits") ||
        lower.includes("balance")
    ) {
        return {
            code: "insufficient_quota",
            action: "switch_model",
            message: `Insufficient credits or quota on your ${providerLabel} account.`,
            provider,
            retryable: false
        };
    }

    if (
        lower.includes("context length") ||
        lower.includes("too long") ||
        lower.includes("maximum context")
    ) {
        return {
            code: "context_length_exceeded",
            action: "switch_model",
            message: "The conversation is too long for this model. Start a new conversation or switch to a model with a larger context window.",
            provider,
            retryable: false
        };
    }

    if (
        lower.includes("model") &&
        (lower.includes("not found") ||
            lower.includes("unavailable") ||
            lower.includes("404"))
    ) {
        return {
            code: "model_unavailable",
            action: "switch_model",
            message: "The selected model is unavailable. Try a different model.",
            provider,
            retryable: false
        };
    }

    if (lower.includes("timeout") || lower.includes("timed out")) {
        return {
            code: "request_timeout",
            action: "retry",
            message: "The request timed out. Please try again.",
            provider,
            retryable: true
        };
    }

    if (
        lower.includes("no response body") ||
        lower.includes("fetch") ||
        lower.includes("network") ||
        lower.includes("connection") ||
        lower.includes("unable to reach")
    ) {
        return {
            code: "network_error",
            action: "retry",
            message: "Connection failed. Check your internet and try again.",
            provider,
            retryable: true
        };
    }

    return null;
}
