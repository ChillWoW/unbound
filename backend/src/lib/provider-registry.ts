export const PROVIDER_TYPES = [
    "openrouter",
    "openai",
    "anthropic",
    "google",
    "kimi"
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export function isValidProvider(value: string): value is ProviderType {
    return PROVIDER_TYPES.includes(value as ProviderType);
}

export const PROVIDER_LABELS: Record<ProviderType, string> = {
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    kimi: "Kimi"
};

export const DIRECT_PROVIDERS: Exclude<ProviderType, "openrouter">[] = [
    "openai",
    "anthropic",
    "google",
    "kimi"
];
