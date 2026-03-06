import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client";

await migrate(db, {
    migrationsFolder: "./src/db/migrations"
});

await sql.end();

console.log("Database migrations completed.");
