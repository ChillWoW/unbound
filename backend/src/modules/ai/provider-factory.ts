import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ProviderType } from "../../lib/provider-registry";

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
