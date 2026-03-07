import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { userSettings } from "../../db/schema";

export const settingsRepository = {
    async findByUserId(userId: string) {
        const [settings] = await db
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, userId))
            .limit(1);

        return settings ?? null;
    },

    async upsertOpenRouterApiKey(input: {
        userId: string;
        openRouterApiKeyCiphertext: string;
        openRouterApiKeyPreview: string;
    }) {
        const now = new Date();
        const [settings] = await db
            .insert(userSettings)
            .values({
                userId: input.userId,
                openRouterApiKeyCiphertext: input.openRouterApiKeyCiphertext,
                openRouterApiKeyPreview: input.openRouterApiKeyPreview,
                createdAt: now,
                updatedAt: now
            })
            .onConflictDoUpdate({
                target: [userSettings.userId],
                set: {
                    openRouterApiKeyCiphertext:
                        input.openRouterApiKeyCiphertext,
                    openRouterApiKeyPreview: input.openRouterApiKeyPreview,
                    updatedAt: now
                }
            })
            .returning();

        if (!settings) {
            throw new Error("Failed to save user settings.");
        }

        return settings;
    },

    async deleteByUserId(userId: string) {
        await db.delete(userSettings).where(eq(userSettings.userId, userId));
    }
};
