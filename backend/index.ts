import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

const app = new Elysia()
    .use(
        cors({
            origin: "http://localhost:3000"
        })
    )
    .get("/health", () => ({ ok: true }))
    .get("/api/hello", () => ({ message: "Hello from Elysia" }))
    .listen(1234);

console.log(`API running at ${app.server?.hostname}:${app.server?.port}`);
