import {
    boolean,
    index,
    pgTable,
    text,
    timestamp,
    uuid
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const conversations = pgTable(
    "conversations",
    {
        id: text("id").primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        titleSource: text("title_source").notNull(),
        isFavorite: boolean("is_favorite").default(false).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        lastMessageAt: timestamp("last_message_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        latestMessageId: text("latest_message_id"),
        lastMessagePreview: text("last_message_preview")
            .default("")
            .notNull(),
        lastMessageRole: text("last_message_role"),
        latestAssistantMessageId: text("latest_assistant_message_id")
    },
    (table) => ({
        userLastMessageAtIndex: index(
            "conversations_user_last_message_at_idx"
        ).on(table.userId, table.lastMessageAt)
    })
);
