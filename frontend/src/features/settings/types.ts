export interface UserSettingsSummary {
    hasOpenRouterApiKey: boolean;
    openRouterApiKeyPreview: string | null;
    openRouterApiKeyUpdatedAt: string | null;
}

export interface SettingsResponse {
    settings: UserSettingsSummary;
}
