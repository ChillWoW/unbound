import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const PROVIDER_TYPES = [
    "openrouter",
    "openai",
    "anthropic",
    "google"
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export function isValidProvider(value: string): value is ProviderType {
    return PROVIDER_TYPES.includes(value as ProviderType);
}

export function createModelInstance(
    provider: ProviderType,
    modelId: string,
    apiKey: string
) {
    switch (provider) {
        case "openrouter":
            return createOpenRouter({ apiKey })(modelId);
        case "openai":
            return createOpenAI({ apiKey })(modelId);
        case "anthropic":
            return createAnthropic({ apiKey })(modelId);
        case "google":
            return createGoogleGenerativeAI({ apiKey })(modelId);
    }
}
