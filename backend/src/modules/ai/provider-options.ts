import type { JSONValue } from "ai";
import type { ProviderType } from "../../lib/provider-registry";

type ProviderOptionsMap = Record<string, Record<string, JSONValue>>;

const DEFAULT_ANTHROPIC_THINKING_BUDGET = 16_000;
const DEFAULT_OPENAI_REASONING_EFFORT = "medium";
const DEFAULT_GOOGLE_THINKING_LEVEL = "high";

function supportsOpenAIReasoning(modelId: string): boolean {
    return (
        modelId.startsWith("gpt-5") ||
        modelId.startsWith("o3") ||
        modelId.startsWith("o4")
    );
}

function supportsAnthropicReasoning(modelId: string): boolean {
    return (
        modelId.startsWith("claude-opus-4") ||
        modelId.startsWith("claude-sonnet-4")
    );
}

function supportsKimiReasoning(modelId: string): boolean {
    return modelId === "kimi-k2-thinking" || modelId === "k2p5";
}

function supportsGoogleReasoning(modelId: string): boolean {
    return modelId.startsWith("gemini-");
}

function buildAnthropicThinkingOptions(
    budgetTokens = DEFAULT_ANTHROPIC_THINKING_BUDGET
): ProviderOptionsMap {
    return {
        anthropic: {
            thinking: {
                type: "enabled",
                budgetTokens
            }
        }
    };
}

function resolveOpenRouterReasoning(
    modelId: string
): ProviderOptionsMap | undefined {
    if (
        modelId.includes("claude-opus-4") ||
        modelId.includes("claude-sonnet-4")
    ) {
        return buildAnthropicThinkingOptions();
    }

    if (
        modelId.includes("gpt-5") ||
        modelId.includes("/o3") ||
        modelId.includes("/o4")
    ) {
        return {
            openai: {
                reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
                reasoningSummary: "detailed"
            }
        };
    }

    if (modelId.includes("gemini-")) {
        return {
            google: {
                thinkingConfig: {
                    thinkingLevel: DEFAULT_GOOGLE_THINKING_LEVEL,
                    includeThoughts: true
                }
            }
        };
    }

    return undefined;
}

export function buildProviderOptions(
    provider: ProviderType,
    modelId: string,
    thinking: boolean
): ProviderOptionsMap | undefined {
    if (!thinking) return undefined;

    switch (provider) {
        case "openai":
            if (!supportsOpenAIReasoning(modelId)) return undefined;
            return {
                openai: {
                    reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
                    reasoningSummary: "detailed"
                }
            };

        case "anthropic":
            if (!supportsAnthropicReasoning(modelId)) return undefined;
            return buildAnthropicThinkingOptions();

        case "google":
            if (!supportsGoogleReasoning(modelId)) return undefined;
            return {
                google: {
                    thinkingConfig: {
                        thinkingLevel: DEFAULT_GOOGLE_THINKING_LEVEL,
                        includeThoughts: true
                    }
                }
            };

        case "kimi":
            if (!supportsKimiReasoning(modelId)) return undefined;
            return buildAnthropicThinkingOptions();

        case "openrouter":
            return resolveOpenRouterReasoning(modelId);

        default:
            return undefined;
    }
}
