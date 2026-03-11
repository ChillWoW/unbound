import type { InferSelectModel } from "drizzle-orm";
import { userSettings } from "../../db/schema";
import type { ProviderType } from "../../lib/provider-registry";
import { AppError } from "../../lib/app-error";
import type {
    MemoryConfidence,
    MemoryKind,
    MemoryWritePolicy
} from "../memory/memory.types";

export type UserSettingsRecord = InferSelectModel<typeof userSettings>;

export interface ProviderKeyStatus {
    configured: boolean;
    preview: string | null;
    updatedAt: string | null;
}

export interface UserSettingsSummary {
    providers: Record<ProviderType, ProviderKeyStatus>;
    memory: MemoryWritePolicy;
}

export { AppError as SettingsError };

const CIPHERTEXT_FIELDS = {
    openrouter: "openrouterApiKeyCiphertext",
    openai: "openaiApiKeyCiphertext",
    anthropic: "anthropicApiKeyCiphertext",
    google: "googleApiKeyCiphertext",
    kimi: "kimiApiKeyCiphertext"
} as const satisfies Record<ProviderType, keyof UserSettingsRecord>;

const PREVIEW_FIELDS = {
    openrouter: "openrouterApiKeyPreview",
    openai: "openaiApiKeyPreview",
    anthropic: "anthropicApiKeyPreview",
    google: "googleApiKeyPreview",
    kimi: "kimiApiKeyPreview"
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

export function toMemorySettingsSummary(
    settings: UserSettingsRecord | null
): MemoryWritePolicy {
    const minConfidence = settings?.memoryMinConfidence;

    return {
        enabled: settings?.memoryEnabled ?? true,
        minConfidence:
            minConfidence === "low" ||
            minConfidence === "medium" ||
            minConfidence === "high"
                ? (minConfidence as MemoryConfidence)
                : "medium",
        allowedKinds: {
            preference: settings?.memoryAllowPreference ?? true,
            workflow: settings?.memoryAllowWorkflow ?? true,
            profile: settings?.memoryAllowProfile ?? true,
            project_context: settings?.memoryAllowProjectContext ?? true
        } satisfies Record<MemoryKind, boolean>,
        customInstructions: settings?.memoryCustomInstructions ?? null
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
            google: providerKeyStatus(settings, "google"),
            kimi: providerKeyStatus(settings, "kimi")
        },
        memory: toMemorySettingsSummary(settings)
    };
}
