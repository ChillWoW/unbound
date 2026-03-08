export type ProviderType = "openrouter" | "openai" | "anthropic" | "google";

export interface ProviderKeyStatus {
    configured: boolean;
    preview: string | null;
    updatedAt: string | null;
}

export interface UserSettingsSummary {
    providers: Record<ProviderType, ProviderKeyStatus>;
}

export interface SettingsResponse {
    settings: UserSettingsSummary;
}
