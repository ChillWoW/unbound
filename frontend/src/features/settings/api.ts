import { api } from "@/lib/api";
import type { ProviderType, SettingsResponse } from "./types";

export const settingsApi = {
    getSettings() {
        return api.get<SettingsResponse>("/api/settings");
    },

    updateProviderApiKey(provider: ProviderType, apiKey: string) {
        return api.put<SettingsResponse>(
            `/api/settings/provider-keys/${provider}`,
            { body: { apiKey } }
        );
    },

    removeProviderApiKey(provider: ProviderType) {
        return api.delete<SettingsResponse>(
            `/api/settings/provider-keys/${provider}`
        );
    }
};
