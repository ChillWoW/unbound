import { authService } from "../auth/auth.service";
import { settingsService } from "../settings/settings.service";
import { selectSupportedModels } from "./supported-models";
import {
    ModelsError,
    normalizeModelsResponse,
    type ModelSummary
} from "./models.types";
import { DEFAULT_CONTEXT_LENGTH } from "../ai/token-estimator";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedModels: ModelSummary[] | null = null;
let cacheTimestamp = 0;

function updateCache(models: ModelSummary[]) {
    cachedModels = models;
    cacheTimestamp = Date.now();
}

function getCachedContextLength(modelId: string): number | null {
    if (!cachedModels || Date.now() - cacheTimestamp > CACHE_TTL_MS) {
        return null;
    }

    const model = cachedModels.find((m) => m.id === modelId);
    return model?.contextLength ?? null;
}

export const modelsService = {
    async listModels(request: Request) {
        const user = await authService.getCurrentUser(request);

        let apiKey: string | null = null;

        if (user) {
            apiKey = await settingsService.getDecryptedOpenRouterApiKeyForUser(user.id);
        }

        const headers: Record<string, string> = { Accept: "application/json" };

        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

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

        const models = selectSupportedModels(
            normalizeModelsResponse(payload)
        );
        updateCache(models);
        return models;
    },

    getModelContextLength(modelId: string): number {
        return getCachedContextLength(modelId) ?? DEFAULT_CONTEXT_LENGTH;
    }
};
