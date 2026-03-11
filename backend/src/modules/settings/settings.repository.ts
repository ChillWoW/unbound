import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { userSettings } from "../../db/schema";
import type { ProviderType } from "../../lib/provider-registry";
import { getCiphertextField, getPreviewField } from "./settings.types";

export const settingsRepository = {
    async findByUserId(userId: string) {
        const [settings] = await db
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, userId))
            .limit(1);

        return settings ?? null;
    },

    async upsertProviderApiKey(input: {
        userId: string;
        provider: ProviderType;
        ciphertext: string;
        preview: string;
    }) {
        const now = new Date();
        const ciphertextCol = getCiphertextField(input.provider);
        const previewCol = getPreviewField(input.provider);

        const [settings] = await db
            .insert(userSettings)
            .values({
                userId: input.userId,
                [ciphertextCol]: input.ciphertext,
                [previewCol]: input.preview,
                createdAt: now,
                updatedAt: now
            })
            .onConflictDoUpdate({
                target: [userSettings.userId],
                set: {
                    [ciphertextCol]: input.ciphertext,
                    [previewCol]: input.preview,
                    updatedAt: now
                }
            })
            .returning();

        if (!settings) {
            throw new Error("Failed to save user settings.");
        }

        return settings;
    },

    async clearProviderApiKey(userId: string, provider: ProviderType) {
        const ciphertextCol = getCiphertextField(provider);
        const previewCol = getPreviewField(provider);

        await db
            .update(userSettings)
            .set({
                [ciphertextCol]: null,
                [previewCol]: null,
                updatedAt: new Date()
            })
            .where(eq(userSettings.userId, userId));
    },

    async upsertMemorySettings(input: {
        userId: string;
        enabled: boolean;
        minConfidence: "low" | "medium" | "high";
        allowedKinds: {
            preference: boolean;
            workflow: boolean;
            profile: boolean;
            project_context: boolean;
        };
        customInstructions: string | null;
    }) {
        const now = new Date();

        const [settings] = await db
            .insert(userSettings)
            .values({
                userId: input.userId,
                memoryEnabled: input.enabled,
                memoryMinConfidence: input.minConfidence,
                memoryAllowPreference: input.allowedKinds.preference,
                memoryAllowWorkflow: input.allowedKinds.workflow,
                memoryAllowProfile: input.allowedKinds.profile,
                memoryAllowProjectContext: input.allowedKinds.project_context,
                memoryCustomInstructions: input.customInstructions,
                createdAt: now,
                updatedAt: now
            })
            .onConflictDoUpdate({
                target: [userSettings.userId],
                set: {
                    memoryEnabled: input.enabled,
                    memoryMinConfidence: input.minConfidence,
                    memoryAllowPreference: input.allowedKinds.preference,
                    memoryAllowWorkflow: input.allowedKinds.workflow,
                    memoryAllowProfile: input.allowedKinds.profile,
                    memoryAllowProjectContext: input.allowedKinds.project_context,
                    memoryCustomInstructions: input.customInstructions,
                    updatedAt: now
                }
            })
            .returning();

        if (!settings) {
            throw new Error("Failed to save memory settings.");
        }

        return settings;
    },

    async deleteByUserId(userId: string) {
        await db.delete(userSettings).where(eq(userSettings.userId, userId));
    }
};
