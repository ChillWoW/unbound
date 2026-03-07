import {
    index,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uuid
} from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { messages } from "./messages";
import { users } from "./users";

export const conversationReads = pgTable(
    "conversation_reads",
    {
        conversationId: text("conversation_id")
            .notNull()
            .references(() => conversations.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        lastReadAssistantMessageId: text(
            "last_read_assistant_message_id"
        ).references(() => messages.id, { onDelete: "set null" }),
        lastReadAt: timestamp("last_read_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => ({
        primaryKey: primaryKey({
            name: "conversation_reads_pk",
            columns: [table.conversationId, table.userId]
        }),
        userUpdatedAtIndex: index("conversation_reads_user_updated_at_idx").on(
            table.userId,
            table.updatedAt
        )
    })
);
