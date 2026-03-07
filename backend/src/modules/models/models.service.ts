import { requireAuth } from "../../middleware/require-auth";
import { settingsService } from "../settings/settings.service";
import { selectSupportedModels } from "./supported-models";
import { ModelsError, normalizeModelsResponse } from "./models.types";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export const modelsService = {
    async listModels(request: Request) {
        const user = await requireAuth(request);
        const apiKey = await settingsService.getDecryptedOpenRouterApiKeyForUser(
            user.id
        );

        if (!apiKey) {
            throw new ModelsError(400, "Add your OpenRouter API key in settings to load models.");
        }

        let response: Response;

        try {
            response = await fetch(OPENROUTER_MODELS_URL, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: "application/json"
                }
            });
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

        return selectSupportedModels(normalizeModelsResponse(payload));
    }
};
