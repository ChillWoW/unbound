import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../middleware/require-auth";
import { mcpService } from "./mcp.service";
import { McpError } from "./mcp.types";

const mcpServerBody = t.Object({
    name: t.String({ minLength: 1, maxLength: 80 }),
    url: t.String({ minLength: 1, maxLength: 1000 }),
    authMode: t.Union([
        t.Literal("none"),
        t.Literal("bearer"),
        t.Literal("header")
    ]),
    authHeaderName: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    authToken: t.Optional(t.String({ minLength: 1, maxLength: 2000 })),
    keepExistingAuthToken: t.Optional(t.Boolean()),
    enabled: t.Boolean(),
    toolPrefix: t.String({ minLength: 1, maxLength: 32 }),
    allowAllTools: t.Boolean(),
    allowedTools: t.Optional(
        t.Array(t.String({ minLength: 1, maxLength: 120 }), { maxItems: 200 })
    )
});

const serverParams = t.Object({
    serverId: t.String({ minLength: 1, maxLength: 64 })
});

function handleMcpError(
    error: unknown,
    set: { status?: number | string }
) {
    if (error instanceof UnauthorizedError) {
        set.status = error.status;
        return { message: error.message };
    }

    if (error instanceof McpError) {
        set.status = error.status;
        return { message: error.message };
    }

    throw error;
}

export const mcpRoutes = new Elysia({ prefix: "/api/settings/mcp" })
    .get("/servers", async ({ request, set }) => {
        try {
            return await mcpService.listServers(request);
        } catch (error) {
            return handleMcpError(error, set);
        }
    })
    .post(
        "/servers",
        async ({ body, request, set }) => {
            try {
                return await mcpService.createServer(request, body);
            } catch (error) {
                return handleMcpError(error, set);
            }
        },
        { body: mcpServerBody }
    )
    .put(
        "/servers/:serverId",
        async ({ body, params, request, set }) => {
            try {
                return await mcpService.updateServer(request, params.serverId, body);
            } catch (error) {
                return handleMcpError(error, set);
            }
        },
        {
            body: mcpServerBody,
            params: serverParams
        }
    )
    .delete(
        "/servers/:serverId",
        async ({ params, request, set }) => {
            try {
                return await mcpService.deleteServer(request, params.serverId);
            } catch (error) {
                return handleMcpError(error, set);
            }
        },
        { params: serverParams }
    )
    .post(
        "/servers/:serverId/test",
        async ({ params, request, set }) => {
            try {
                return await mcpService.testServer(request, params.serverId);
            } catch (error) {
                return handleMcpError(error, set);
            }
        },
        { params: serverParams }
    )
    .post(
        "/servers/:serverId/discover",
        async ({ params, request, set }) => {
            try {
                return await mcpService.testServer(request, params.serverId);
            } catch (error) {
                return handleMcpError(error, set);
            }
        },
        { params: serverParams }
    );
