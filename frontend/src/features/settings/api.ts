import api from "@/lib/api";
import type { SettingsResponse } from "./types";

export const settingsApi = {
    getSettings() {
        return api.get<SettingsResponse>("/api/settings");
    },

    removeOpenRouterApiKey() {
        return api.delete<SettingsResponse>("/api/settings/openrouter-key");
    },

    updateOpenRouterApiKey(apiKey: string) {
        return api.put<SettingsResponse>("/api/settings/openrouter-key", {
            body: { apiKey }
        });
    }
};
