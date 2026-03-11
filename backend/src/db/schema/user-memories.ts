import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userMemories = pgTable(
    "user_memories",
    {
        id: text("id").primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        kind: text("kind").notNull(),
        content: text("content").notNull(),
        confidence: text("confidence").notNull().default("medium"),
        keywords: jsonb("keywords").$type<string[]>().notNull(),
        source: jsonb("source")
            .$type<{
                origin: "tool";
                reason: string;
                conversationId: string | null;
                messageId: string | null;
                excerpt: string | null;
            }>()
            .notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true })
    },
    (table) => ({
        userUpdatedAtIndex: index("user_memories_user_updated_at_idx").on(
            table.userId,
            table.updatedAt
        ),
        userKindUpdatedAtIndex: index("user_memories_user_kind_updated_at_idx").on(
            table.userId,
            table.kind,
            table.updatedAt
        ),
        userConfidenceUpdatedAtIndex: index(
            "user_memories_user_confidence_updated_at_idx"
        ).on(table.userId, table.confidence, table.updatedAt)
    })
);
