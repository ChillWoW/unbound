import { sql } from "drizzle-orm";
import {
    boolean,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid
} from "drizzle-orm/pg-core";
import { users } from "./users";

export interface UserMcpDiscoveredToolRecord {
    name: string;
    title: string | null;
    description: string | null;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
}

export const userMcpServers = pgTable(
    "user_mcp_servers",
    {
        id: text("id").primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        transport: text("transport").notNull().default("streamable_http"),
        enabled: boolean("enabled").notNull().default(true),
        urlCiphertext: text("url_ciphertext").notNull(),
        urlPreview: text("url_preview").notNull(),
        authMode: text("auth_mode").notNull().default("none"),
        authHeaderName: text("auth_header_name"),
        authTokenCiphertext: text("auth_token_ciphertext"),
        authTokenPreview: text("auth_token_preview"),
        toolPrefix: text("tool_prefix").notNull(),
        allowedTools: jsonb("allowed_tools").$type<string[] | null>(),
        discoveredTools: jsonb("discovered_tools")
            .$type<UserMcpDiscoveredToolRecord[]>()
            .notNull()
            .default(sql`'[]'::jsonb`),
        lastHealthStatus: text("last_health_status")
            .notNull()
            .default("unknown"),
        lastHealthError: text("last_health_error"),
        lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
        lastDiscoveredAt: timestamp("last_discovered_at", {
            withTimezone: true
        }),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => ({
        userUpdatedAtIndex: index("user_mcp_servers_user_updated_at_idx").on(
            table.userId,
            table.updatedAt
        ),
        userToolPrefixUniqueIndex: uniqueIndex(
            "user_mcp_servers_user_tool_prefix_unique"
        ).on(table.userId, table.toolPrefix)
    })
);
