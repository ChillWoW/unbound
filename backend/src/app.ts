import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "./config/env";
import { authRoutes } from "./modules/auth/auth.routes";
import { conversationsRoutes } from "./modules/conversations/conversations.routes";
import { modelsRoutes } from "./modules/models/models.routes";
import { settingsRoutes } from "./modules/settings/settings.routes";
import { aiRoutes } from "./modules/ai/ai.routes";
import { todosRoutes } from "./modules/todos/todos.routes";
import { memoryRoutes } from "./modules/memory/memory.routes";

const MAX_JSON_BODY_BYTES = 30 * 1024 * 1024;

function getContentLength(request: Request): number | null {
    const rawValue = request.headers.get("content-length");

    if (!rawValue) {
        return null;
    }

    const value = Number.parseInt(rawValue, 10);

    return Number.isFinite(value) && value >= 0 ? value : null;
}

export const app = new Elysia()
    .onRequest(({ request, set }) => {
        const contentType = request.headers.get("content-type") ?? "";
        const contentLength = getContentLength(request);

        if (
            contentLength !== null &&
            contentLength > MAX_JSON_BODY_BYTES &&
            contentType.includes("application/json")
        ) {
            set.status = 413;
            return {
                message: "Request body is too large."
            };
        }
    })
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
    .use(authRoutes)
    .use(conversationsRoutes)
    .use(modelsRoutes)
    .use(settingsRoutes)
    .use(memoryRoutes)
    .use(todosRoutes)
    .use(aiRoutes);
