import type { ProviderType } from "@/lib/provider-types";

export type { ProviderType };

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
