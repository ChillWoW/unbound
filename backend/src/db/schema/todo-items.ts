import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { users } from "./users";

export const todoItems = pgTable(
    "todo_items",
    {
        id: text("id").primaryKey(),
        conversationId: text("conversation_id")
            .notNull()
            .references(() => conversations.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        content: text("content").notNull(),
        status: text("status").notNull().default("pending"),
        priority: text("priority").notNull().default("medium"),
        position: integer("position").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => ({
        conversationPositionIndex: index(
            "todo_items_conversation_position_idx"
        ).on(table.conversationId, table.position)
    })
);
