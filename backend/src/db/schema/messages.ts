import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";

export const messages = pgTable(
    "messages",
    {
        id: text("id").primaryKey(),
        conversationId: text("conversation_id")
            .notNull()
            .references(() => conversations.id, { onDelete: "cascade" }),
        parentMessageId: text("parent_message_id"),
        role: text("role").notNull(),
        parts: jsonb("parts")
            .$type<
                Array<
                    | { type: "text"; text: string }
                    | { type: "image"; data: string; mimeType: string }
                    | { type: "file"; data: string; mimeType: string }
                    | {
                          type: "tool-invocation";
                          toolInvocationId: string;
                          toolName: string;
                          args: Record<string, unknown>;
                          state: "call" | "result" | "error";
                          result?: unknown;
                      }
                    | { type: "reasoning"; text: string }
                >
            >()
            .notNull(),
        status: text("status").notNull(),
        metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => ({
        conversationCreatedAtIndex: index(
            "messages_conversation_created_at_idx"
        ).on(table.conversationId, table.createdAt),
        conversationRoleCreatedAtIndex: index(
            "messages_conversation_role_created_at_idx"
        ).on(table.conversationId, table.role, table.createdAt),
        parentMessageIdIndex: index(
            "messages_parent_message_id_idx"
        ).on(table.parentMessageId)
    })
);
