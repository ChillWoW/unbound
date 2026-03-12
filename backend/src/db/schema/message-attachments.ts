import {
    index,
    integer,
    pgTable,
    text,
    timestamp
} from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { messages } from "./messages";

export const messageAttachments = pgTable(
    "message_attachments",
    {
        id: text("id").primaryKey(),
        conversationId: text("conversation_id")
            .notNull()
            .references(() => conversations.id, { onDelete: "cascade" }),
        messageId: text("message_id")
            .notNull()
            .references(() => messages.id, { onDelete: "cascade" }),
        kind: text("kind").notNull(),
        storageKey: text("storage_key").notNull(),
        mimeType: text("mime_type").notNull(),
        filename: text("filename").notNull(),
        size: integer("size").notNull(),
        sha256: text("sha256").notNull(),
        extractedText: text("extracted_text"),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => ({
        messageIndex: index("message_attachments_message_idx").on(table.messageId),
        conversationIndex: index("message_attachments_conversation_idx").on(
            table.conversationId,
            table.createdAt
        ),
        storageKeyIndex: index("message_attachments_storage_key_idx").on(
            table.storageKey
        )
    })
);
