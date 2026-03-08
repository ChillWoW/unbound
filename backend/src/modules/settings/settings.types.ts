import type { InferSelectModel } from "drizzle-orm";
import { userSettings } from "../../db/schema";
import type { ProviderType } from "../ai/provider-factory";

export type UserSettingsRecord = InferSelectModel<typeof userSettings>;

export interface ProviderKeyStatus {
    configured: boolean;
    preview: string | null;
    updatedAt: string | null;
}

export interface UserSettingsSummary {
    providers: Record<ProviderType, ProviderKeyStatus>;
}

export class SettingsError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "SettingsError";
        this.status = status;
    }
}

const CIPHERTEXT_FIELDS = {
    openrouter: "openrouterApiKeyCiphertext",
    openai: "openaiApiKeyCiphertext",
    anthropic: "anthropicApiKeyCiphertext",
    google: "googleApiKeyCiphertext"
} as const satisfies Record<ProviderType, keyof UserSettingsRecord>;

const PREVIEW_FIELDS = {
    openrouter: "openrouterApiKeyPreview",
    openai: "openaiApiKeyPreview",
    anthropic: "anthropicApiKeyPreview",
    google: "googleApiKeyPreview"
} as const satisfies Record<ProviderType, keyof UserSettingsRecord>;

export function getCiphertextField(provider: ProviderType) {
    return CIPHERTEXT_FIELDS[provider];
}

export function getPreviewField(provider: ProviderType) {
    return PREVIEW_FIELDS[provider];
}

function providerKeyStatus(
    settings: UserSettingsRecord | null,
    provider: ProviderType
): ProviderKeyStatus {
    if (!settings) {
        return { configured: false, preview: null, updatedAt: null };
    }

    const ciphertext = settings[CIPHERTEXT_FIELDS[provider]];
    const preview = settings[PREVIEW_FIELDS[provider]];

    return {
        configured: ciphertext !== null,
        preview: preview ?? null,
        updatedAt: ciphertext !== null ? settings.updatedAt.toISOString() : null
    };
}

export function toUserSettingsSummary(
    settings: UserSettingsRecord | null
): UserSettingsSummary {
    return {
        providers: {
            openrouter: providerKeyStatus(settings, "openrouter"),
            openai: providerKeyStatus(settings, "openai"),
            anthropic: providerKeyStatus(settings, "anthropic"),
            google: providerKeyStatus(settings, "google")
        }
    };
}
