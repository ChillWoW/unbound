import {
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid
} from "drizzle-orm/pg-core";

export const users = pgTable(
    "users",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        email: text("email").notNull(),
        passwordHash: text("password_hash").notNull(),
        name: text("name"),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => ({
        emailUniqueIndex: uniqueIndex("users_email_unique").on(table.email)
    })
);
