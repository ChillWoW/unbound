import {
    bigint,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uuid
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { conversations } from "./conversations";
import { messages } from "./messages";

export const usageRecords = pgTable(
    "usage_records",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        conversationId: text("conversation_id")
            .notNull()
            .references(() => conversations.id, { onDelete: "cascade" }),
        messageId: text("message_id")
            .notNull()
            .references(() => messages.id, { onDelete: "cascade" }),
        modelId: text("model_id").notNull(),
        provider: text("provider").notNull(),
        promptTokens: integer("prompt_tokens").notNull().default(0),
        completionTokens: integer("completion_tokens").notNull().default(0),
        totalTokens: integer("total_tokens").notNull().default(0),
        inputCostMicros: bigint("input_cost_micros", { mode: "number" })
            .notNull()
            .default(0),
        outputCostMicros: bigint("output_cost_micros", { mode: "number" })
            .notNull()
            .default(0),
        totalCostMicros: bigint("total_cost_micros", { mode: "number" })
            .notNull()
            .default(0),
        promptPricePerToken: text("prompt_price_per_token"),
        completionPricePerToken: text("completion_price_per_token"),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => ({
        userCreatedAtIndex: index("usage_records_user_created_at_idx").on(
            table.userId,
            table.createdAt
        ),
        userModelIndex: index("usage_records_user_model_idx").on(
            table.userId,
            table.modelId
        ),
        userConversationIndex: index(
            "usage_records_user_conversation_idx"
        ).on(table.userId, table.conversationId)
    })
);
