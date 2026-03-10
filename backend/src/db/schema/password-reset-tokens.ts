import {
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const passwordResetTokens = pgTable(
    "password_reset_tokens",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tokenHash: text("token_hash").notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        consumedAt: timestamp("consumed_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => ({
        tokenHashUniqueIndex: uniqueIndex(
            "password_reset_tokens_token_hash_unique"
        ).on(table.tokenHash)
    })
);
