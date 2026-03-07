import { env } from "../../config/env";
import { requireAuth } from "../../middleware/require-auth";
import { decryptText, encryptText } from "../../lib/encryption";
import { settingsRepository } from "./settings.repository";
import { SettingsError, toUserSettingsSummary } from "./settings.types";

function normalizeOpenRouterApiKey(value: string): string {
    const normalized = value.trim();

    if (!normalized) {
        throw new SettingsError(400, "OpenRouter API key is required.");
    }

    if (normalized.length < 20) {
        throw new SettingsError(400, "OpenRouter API key looks too short.");
    }

    if (normalized.length > 500) {
        throw new SettingsError(400, "OpenRouter API key is too long.");
    }

    if (/\s/.test(normalized)) {
        throw new SettingsError(
            400,
            "OpenRouter API key must not contain spaces."
        );
    }

    return normalized;
}

function createOpenRouterApiKeyPreview(value: string): string {
    const lastFour = value.slice(-4);
    return `********${lastFour}`;
}

export const settingsService = {
    async getSettings(request: Request) {
        const user = await requireAuth(request);
        const settings = await settingsRepository.findByUserId(user.id);

        return toUserSettingsSummary(settings);
    },

    async setOpenRouterApiKey(request: Request, input: { apiKey: string }) {
        const user = await requireAuth(request);
        const normalizedApiKey = normalizeOpenRouterApiKey(input.apiKey);
        const encryptedApiKey = encryptText(
            normalizedApiKey,
            env.settingsEncryptionKey
        );
        const settings = await settingsRepository.upsertOpenRouterApiKey({
            userId: user.id,
            openRouterApiKeyCiphertext: encryptedApiKey,
            openRouterApiKeyPreview:
                createOpenRouterApiKeyPreview(normalizedApiKey)
        });

        return toUserSettingsSummary(settings);
    },

    async clearOpenRouterApiKey(request: Request) {
        const user = await requireAuth(request);
        await settingsRepository.deleteByUserId(user.id);

        return toUserSettingsSummary(null);
    },

    async getDecryptedOpenRouterApiKeyForUser(userId: string) {
        const settings = await settingsRepository.findByUserId(userId);

        if (!settings) {
            return null;
        }

        return decryptText(
            settings.openRouterApiKeyCiphertext,
            env.settingsEncryptionKey
        );
    }
};
