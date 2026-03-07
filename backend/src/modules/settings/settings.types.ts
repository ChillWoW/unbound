import type { InferSelectModel } from "drizzle-orm";
import { userSettings } from "../../db/schema";

export type UserSettingsRecord = InferSelectModel<typeof userSettings>;

export interface UserSettingsSummary {
    hasOpenRouterApiKey: boolean;
    openRouterApiKeyPreview: string | null;
    openRouterApiKeyUpdatedAt: string | null;
}

export class SettingsError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "SettingsError";
        this.status = status;
    }
}

export function toUserSettingsSummary(
    settings: UserSettingsRecord | null
): UserSettingsSummary {
    return {
        hasOpenRouterApiKey: settings !== null,
        openRouterApiKeyPreview: settings?.openRouterApiKeyPreview ?? null,
        openRouterApiKeyUpdatedAt: settings
            ? settings.updatedAt.toISOString()
            : null
    };
}
