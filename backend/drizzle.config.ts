import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to use Drizzle.");
}

export default defineConfig({
    out: "./src/db/migrations",
    schema: "./src/db/schema/index.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: databaseUrl
    },
    verbose: true,
    strict: true
});
