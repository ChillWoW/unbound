import type { ProviderType } from "../../lib/provider-registry";
import type { ModelSummary } from "./models.types";

interface DirectModelDefinition {
    id: string;
    name: string;
    provider: string;
    source: ProviderType;
    description: string;
    contextLength: number;
    maxOutputTokens: number | null;
    inputPerMillion?: number;
    outputPerMillion?: number;
    inputModalities?: string[];
    outputModalities?: string[];
    free?: boolean;
}

function perMillionToPerToken(perMillion: number): string {
    return (perMillion / 1_000_000).toString();
}

const openaiDirectModels: DirectModelDefinition[] = [
    {
        id: "gpt-5.4-pro-2026-03-05",
        name: "GPT-5.4 Pro",
        provider: "openai",
        source: "openai",
        description:
            "Version of GPT-5.4 that produces smarter and more precise responses",
        contextLength: 1_050_000,
        maxOutputTokens: 128_000,
        inputPerMillion: 30.0,
        outputPerMillion: 180.0,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    },
    {
        id: "gpt-5.4-2026-03-05",
        name: "GPT-5.4",
        provider: "openai",
        source: "openai",
        description: "OpenAI's latest frontier model",
        contextLength: 1_050_000,
        maxOutputTokens: 128_000,
        inputPerMillion: 2.5,
        outputPerMillion: 15.0,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    },
    {
        id: "gpt-5.3-codex",
        name: "GPT-5.3 Codex",
        provider: "openai",
        source: "openai",
        description: "OpenAI's most advanced agentic coding model",
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        inputPerMillion: 1.75,
        outputPerMillion: 14.0,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    },
    {
        id: "gpt-5.2-2025-12-11",
        name: "GPT-5.2",
        provider: "openai",
        source: "openai",
        description: "OpenAI's previous frontier model",
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        inputPerMillion: 1.75,
        outputPerMillion: 14.0,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    },
    {
        id: "gpt-5-mini-2025-08-07",
        name: "GPT-5 Mini",
        provider: "openai",
        source: "openai",
        description: "OpenAI's faster, cost-efficient version of GPT-5",
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        inputPerMillion: 0.25,
        outputPerMillion: 2.0,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    },
    {
        id: "gpt-5-nano-2025-08-07",
        name: "GPT-5 Nano",
        provider: "openai",
        source: "openai",
        description: "OpenAI's fastest, most cost-efficient version of GPT-5",
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        inputPerMillion: 0.05,
        outputPerMillion: 0.4,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    },
    {
        id: "o4-mini-2025-04-16",
        name: "o4 Mini",
        provider: "openai",
        source: "openai",
        description: "OpenAI's fast, cost-efficient reasoning model",
        contextLength: 200_000,
        maxOutputTokens: 100_000,
        inputPerMillion: 1.1,
        outputPerMillion: 4.4,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    },
    {
        id: "gpt-4.1-2025-04-14",
        name: "GPT-4.1",
        provider: "openai",
        source: "openai",
        description: "OpenAI's smartest non reasoning model",
        contextLength: 1_047_576,
        maxOutputTokens: 32_768,
        inputPerMillion: 2.0,
        outputPerMillion: 8.0,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    }
];

const anthropicDirectModels: DirectModelDefinition[] = [
    {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        provider: "anthropic",
        source: "anthropic",
        description: "Anthropic's most intelligent model for coding",
        contextLength: 200_000,
        maxOutputTokens: 128_000,
        inputPerMillion: 5.0,
        outputPerMillion: 25.0,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    },
    {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        provider: "anthropic",
        source: "anthropic",
        description: "Anthropic's best combination of speed and intelligence",
        contextLength: 200_000,
        maxOutputTokens: 64_000,
        inputPerMillion: 3.0,
        outputPerMillion: 15.0,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    },
    {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        provider: "anthropic",
        source: "anthropic",
        description:
            "Anthropic's fastest model with near-frontier intelligence",
        contextLength: 200_000,
        maxOutputTokens: 64_000,
        inputPerMillion: 1.0,
        outputPerMillion: 5.0,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    }
];

const googleDirectModels: DirectModelDefinition[] = [
    {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        provider: "google",
        source: "google",
        description: "Google's most advanced model to date",
        contextLength: 1_048_576,
        maxOutputTokens: 65_536,
        inputModalities: ["text", "image", "video", "audio", "file"],
        outputModalities: ["text"]
    },
    {
        id: "gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview",
        provider: "google",
        source: "google",
        description: "Google's fastest model for quick responses",
        contextLength: 1_048_576,
        maxOutputTokens: 65_536,
        inputModalities: ["text", "image", "video", "audio", "file"],
        outputModalities: ["text"]
    }
];

const kimiDirectModels: DirectModelDefinition[] = [
    {
        id: "kimi-k2-thinking",
        name: "Kimi K2 Thinking",
        provider: "kimi",
        source: "kimi",
        description: "Kimi's reasoning model with extended thinking",
        contextLength: 262_144,
        maxOutputTokens: null,
        inputModalities: ["text"],
        outputModalities: ["text"]
    },
    {
        id: "k2p5",
        name: "Kimi K2.5",
        provider: "kimi",
        source: "kimi",
        description: "Kimi's latest and most capable coding model",
        contextLength: 262_144,
        maxOutputTokens: null,
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
    }
];

const allDirectModels: Record<ProviderType, DirectModelDefinition[]> = {
    openrouter: [],
    openai: openaiDirectModels,
    anthropic: anthropicDirectModels,
    google: googleDirectModels,
    kimi: kimiDirectModels
};

export function getDirectProviderModels(
    provider: ProviderType
): ModelSummary[] {
    return allDirectModels[provider].map((def) => ({
        id: def.id,
        name: def.name,
        provider: def.provider,
        source: def.source,
        description: def.description,
        contextLength: def.contextLength,
        maxOutputTokens: def.maxOutputTokens,
        promptPricing:
            def.inputPerMillion != null
                ? perMillionToPerToken(def.inputPerMillion)
                : null,
        completionPricing:
            def.outputPerMillion != null
                ? perMillionToPerToken(def.outputPerMillion)
                : null,
        inputModalities: def.inputModalities ?? ["text"],
        outputModalities: def.outputModalities ?? ["text"],
        free: def.free
    }));
}
