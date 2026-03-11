import { authService } from "../auth/auth.service";
import { settingsService } from "../settings/settings.service";
import { selectSupportedModels } from "./supported-models";
import { getDirectProviderModels } from "./direct-provider-models";
import {
    ModelsError,
    normalizeModelsResponse,
    type ModelSummary
} from "./models.types";
import { DEFAULT_CONTEXT_LENGTH } from "../ai/token-estimator";
import { DIRECT_PROVIDERS } from "../../lib/provider-registry";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_FREE_EFFECTIVE_CONTEXT_LENGTH = 32_768;
const OPENROUTER_FREE_EFFECTIVE_MAX_OUTPUT_TOKENS = 2_048;

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

interface CacheEntry {
    models: ModelSummary[];
    timestamp: number;
}

const userCache = new Map<string, CacheEntry>();

function applyEffectiveModelLimits(model: ModelSummary): ModelSummary {
    if (model.source !== "openrouter" || !model.free) {
        return model;
    }

    return {
        ...model,
        contextLength:
            model.contextLength === null
                ? OPENROUTER_FREE_EFFECTIVE_CONTEXT_LENGTH
                : Math.min(
                      model.contextLength,
                      OPENROUTER_FREE_EFFECTIVE_CONTEXT_LENGTH
                  ),
        maxOutputTokens:
            model.maxOutputTokens === null
                ? OPENROUTER_FREE_EFFECTIVE_MAX_OUTPUT_TOKENS
                : Math.min(
                      model.maxOutputTokens,
                      OPENROUTER_FREE_EFFECTIVE_MAX_OUTPUT_TOKENS
                  )
    };
}

function updateCache(userId: string | null, models: ModelSummary[]) {
    if (!userId) return;
    if (userCache.size >= MAX_CACHE_ENTRIES) {
        userCache.clear();
    }
    userCache.set(userId, { models, timestamp: Date.now() });
}

function getCachedModel(
    userId: string,
    modelId: string
): ModelSummary | null {
    const entry = userCache.get(userId);
    if (!entry || Date.now() - entry.timestamp > CACHE_TTL_MS) {
        return null;
    }

    return entry.models.find((m) => m.id === modelId) ?? null;
}

export const modelsService = {
    async listModels(request: Request) {
        const user = await authService.getCurrentUser(request);
        const allModels: ModelSummary[] = [];
        const configuredProviders: string[] = [];

        let openrouterKey: string | null = null;

        if (user) {
            openrouterKey =
                await settingsService.getDecryptedApiKeyForUser(
                    user.id,
                    "openrouter"
                );
        }

        if (openrouterKey) {
            configuredProviders.push("openrouter");

            const headers: Record<string, string> = {
                Accept: "application/json",
                Authorization: `Bearer ${openrouterKey}`
            };

            let response: Response;

            try {
                response = await fetch(OPENROUTER_MODELS_URL, { headers });
            } catch {
                throw new ModelsError(
                    502,
                    "Unable to reach OpenRouter to load models right now."
                );
            }

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new ModelsError(
                        400,
                        "Your OpenRouter API key is invalid or expired."
                    );
                }

                throw new ModelsError(
                    502,
                    "OpenRouter could not return models right now."
                );
            }

            let payload: unknown;

            try {
                payload = await response.json();
            } catch {
                throw new ModelsError(
                    502,
                    "OpenRouter returned an unreadable models response."
                );
            }

            const openrouterModels = selectSupportedModels(
                normalizeModelsResponse(payload)
            ).map(applyEffectiveModelLimits);
            allModels.push(...openrouterModels);
        }

        if (user) {
            const directResults = await Promise.all(
                DIRECT_PROVIDERS.map(async (provider) => {
                    const key =
                        await settingsService.getDecryptedApiKeyForUser(
                            user.id,
                            provider
                        );
                    return { provider, hasKey: !!key };
                })
            );

            for (const { provider, hasKey } of directResults) {
                if (hasKey) {
                    configuredProviders.push(provider);
                    allModels.push(...getDirectProviderModels(provider));
                }
            }
        }

        updateCache(user?.id ?? null, allModels);
        return { models: allModels, configuredProviders };
    },

    getModelContextLength(userId: string, modelId: string): number {
        return getCachedModel(userId, modelId)?.contextLength ?? DEFAULT_CONTEXT_LENGTH;
    },

    getModelMaxOutputTokens(userId: string, modelId: string): number | null {
        return getCachedModel(userId, modelId)?.maxOutputTokens ?? null;
    }
};
