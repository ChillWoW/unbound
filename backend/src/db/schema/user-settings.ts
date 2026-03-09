import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userSettings = pgTable("user_settings", {
    userId: uuid("user_id")
        .primaryKey()
        .references(() => users.id, { onDelete: "cascade" }),
    openrouterApiKeyCiphertext: text("openrouter_api_key_ciphertext"),
    openrouterApiKeyPreview: text("openrouter_api_key_preview"),
    openaiApiKeyCiphertext: text("openai_api_key_ciphertext"),
    openaiApiKeyPreview: text("openai_api_key_preview"),
    anthropicApiKeyCiphertext: text("anthropic_api_key_ciphertext"),
    anthropicApiKeyPreview: text("anthropic_api_key_preview"),
    googleApiKeyCiphertext: text("google_api_key_ciphertext"),
    googleApiKeyPreview: text("google_api_key_preview"),
    kimiApiKeyCiphertext: text("kimi_api_key_ciphertext"),
    kimiApiKeyPreview: text("kimi_api_key_preview"),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull()
});
