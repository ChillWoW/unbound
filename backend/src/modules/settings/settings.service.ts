import { env } from "../../config/env";
import { requireVerifiedAuth } from "../../middleware/require-auth";
import { decryptText, encryptText } from "../../lib/encryption";
import { PROVIDER_LABELS, type ProviderType } from "../../lib/provider-registry";
import { settingsRepository } from "./settings.repository";
import {
    SettingsError,
    getCiphertextField,
    toUserSettingsSummary
} from "./settings.types";

function normalizeApiKey(value: string, providerLabel: string): string {
    const normalized = value.trim();

    if (!normalized) {
        throw new SettingsError(400, `${providerLabel} API key is required.`);
    }

    if (normalized.length < 10) {
        throw new SettingsError(
            400,
            `${providerLabel} API key looks too short.`
        );
    }

    if (normalized.length > 500) {
        throw new SettingsError(400, `${providerLabel} API key is too long.`);
    }

    if (/\s/.test(normalized)) {
        throw new SettingsError(
            400,
            `${providerLabel} API key must not contain spaces.`
        );
    }

    return normalized;
}

function createKeyPreview(value: string): string {
    const lastFour = value.slice(-4);
    return `********${lastFour}`;
}

export const settingsService = {
    async getSettings(request: Request) {
        const user = await requireVerifiedAuth(request);
        const settings = await settingsRepository.findByUserId(user.id);
        return toUserSettingsSummary(settings);
    },

    async setProviderApiKey(
        request: Request,
        provider: ProviderType,
        input: { apiKey: string }
    ) {
        const user = await requireVerifiedAuth(request);
        const label = PROVIDER_LABELS[provider];
        const normalizedApiKey = normalizeApiKey(input.apiKey, label);
        const ciphertext = encryptText(
            normalizedApiKey,
            env.settingsEncryptionKey
        );
        const preview = createKeyPreview(normalizedApiKey);

        const settings = await settingsRepository.upsertProviderApiKey({
            userId: user.id,
            provider,
            ciphertext,
            preview
        });

        return toUserSettingsSummary(settings);
    },

    async clearProviderApiKey(request: Request, provider: ProviderType) {
        const user = await requireVerifiedAuth(request);
        await settingsRepository.clearProviderApiKey(user.id, provider);
        const settings = await settingsRepository.findByUserId(user.id);
        return toUserSettingsSummary(settings);
    },

    async getDecryptedApiKeyForUser(
        userId: string,
        provider: ProviderType
    ): Promise<string | null> {
        const settings = await settingsRepository.findByUserId(userId);

        if (!settings) {
            return null;
        }

        const ciphertextField = getCiphertextField(provider);
        const ciphertext = settings[ciphertextField];

        if (!ciphertext) {
            return null;
        }

        return decryptText(ciphertext, env.settingsEncryptionKey);
    }
};
