import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env";
import * as schema from "./schema";

export const sql = postgres(env.databaseUrl, {
    max: 10,
    prepare: false
});

export const db = drizzle(sql, { schema });
