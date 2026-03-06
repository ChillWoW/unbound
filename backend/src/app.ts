import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "./config/env";
import { authRoutes } from "./modules/auth/auth.routes";

export const app = new Elysia()
    .use(
        cors({
            origin: env.corsOrigin,
            credentials: true,
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type"]
        })
    )
    .get("/health", () => ({ ok: true }))
    .get("/api/hello", () => ({ message: "Hello from Elysia" }))
    .use(authRoutes);
