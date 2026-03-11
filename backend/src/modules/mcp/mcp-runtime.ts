import { tool } from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import type { McpConnectionSnapshot, ResolvedUserMcpServer } from "./mcp.types";

const MCP_REQUEST_TIMEOUT_MS = 15_000;
const MCP_MAX_TOOL_NAME_LENGTH = 64;

type McpToolSet = Record<string, any>;

type JsonSchemaObject = {
    type?: string | string[];
    description?: string;
    properties?: Record<string, JsonSchemaObject>;
    required?: string[];
    items?: JsonSchemaObject;
    enum?: unknown[];
    anyOf?: JsonSchemaObject[];
    oneOf?: JsonSchemaObject[];
};

function truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function sanitizeToolSegment(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 24);
}

function buildExposedToolName(prefix: string, toolName: string, index: number): string {
    const normalizedPrefix = sanitizeToolSegment(prefix) || "mcp";
    const normalizedToolName = sanitizeToolSegment(toolName) || `tool_${index + 1}`;
    const base = `${normalizedPrefix}__${normalizedToolName}`;

    if (base.length <= MCP_MAX_TOOL_NAME_LENGTH) {
        return base;
    }

    return truncateText(base, MCP_MAX_TOOL_NAME_LENGTH);
}

function describeMcpTool(input: {
    serverName: string;
    toolName: string;
    description: string | undefined;
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
    };
}) {
    const parts = [`MCP tool from ${input.serverName}.`];

    if (input.description?.trim()) {
        parts.push(input.description.trim());
    }

    const annotationNotes = [
        input.annotations?.readOnlyHint ? "Read-only." : null,
        input.annotations?.destructiveHint ? "Potentially destructive." : null,
        input.annotations?.idempotentHint ? "Idempotent." : null,
        input.annotations?.openWorldHint ? "May access external systems." : null
    ].filter(Boolean);

    if (annotationNotes.length > 0) {
        parts.push(annotationNotes.join(" "));
    }

    parts.push(`Original MCP tool name: ${input.toolName}.`);

    return parts.join(" ");
}

function normalizeToolResult(result: unknown) {
    const payload = result as {
        isError?: boolean;
        structuredContent?: Record<string, unknown> | null;
        content?: Array<Record<string, unknown> & { type: string }>;
    };

    return {
        isError: payload.isError ?? false,
        structuredContent: payload.structuredContent ?? null,
        content: (payload.content ?? []).map((item) => {
            switch (item.type) {
                case "text":
                    return { type: item.type, text: String(item.text ?? "") };
                case "image":
                    return {
                        type: item.type,
                        mimeType:
                            typeof item.mimeType === "string" ? item.mimeType : null,
                        dataLength:
                            typeof item.data === "string" ? item.data.length : 0
                    };
                case "audio":
                    return {
                        type: item.type,
                        mimeType:
                            typeof item.mimeType === "string" ? item.mimeType : null,
                        dataLength:
                            typeof item.data === "string" ? item.data.length : 0
                    };
                case "resource_link":
                    return {
                        type: item.type,
                        name: String(item.name ?? ""),
                        uri: String(item.uri ?? ""),
                        description:
                            typeof item.description === "string"
                                ? item.description
                                : null,
                        mimeType:
                            typeof item.mimeType === "string" ? item.mimeType : null
                    };
                case "resource":
                    return {
                        type: item.type,
                        resource: item.resource
                    };
                default:
                    return item;
            }
        })
    };
}

function schemaFromEnum(values: unknown[]): z.ZodTypeAny {
    const literals = values.filter(
        (value): value is string | number | boolean =>
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
    );

    if (literals.length === 0) {
        return z.any();
    }

    if (literals.every((value) => typeof value === "string")) {
        return z.enum(literals as [string, ...string[]]);
    }

    return z.custom((value) => literals.includes(value as never), {
        message: `Expected one of: ${literals.join(", ")}`
    });
}

function jsonSchemaToZod(schema: JsonSchemaObject | undefined, depth = 0): z.ZodTypeAny {
    if (!schema || depth > 8) {
        return z.any();
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
        return schemaFromEnum(schema.enum);
    }

    const variants = schema.anyOf ?? schema.oneOf;

    if (variants && variants.length > 1) {
        const zodVariants = variants.map((variant) => jsonSchemaToZod(variant, depth + 1));
        return z.union(
            zodVariants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]
        );
    }

    const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    let result: z.ZodTypeAny;

    switch (schemaType) {
        case "string":
            result = z.string();
            break;
        case "number":
            result = z.number();
            break;
        case "integer":
            result = z.number().int();
            break;
        case "boolean":
            result = z.boolean();
            break;
        case "array":
            result = z.array(jsonSchemaToZod(schema.items, depth + 1));
            break;
        case "object": {
            const shape: Record<string, z.ZodTypeAny> = {};
            const required = new Set(schema.required ?? []);

            for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
                const property = jsonSchemaToZod(propertySchema, depth + 1);
                shape[key] = required.has(key) ? property : property.optional();
            }

            result = z.object(shape).passthrough();
            break;
        }
        default:
            result = z.any();
    }

    if (schema.description?.trim()) {
        return result.describe(schema.description.trim());
    }

    return result;
}

function combineAbortSignals(
    signalA: AbortSignal | null,
    signalB: AbortSignal | null
): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();

    if (signalA?.aborted || signalB?.aborted) {
        controller.abort();
        return { signal: controller.signal, cleanup: () => undefined };
    }

    const abort = () => controller.abort();

    signalA?.addEventListener("abort", abort, { once: true });
    signalB?.addEventListener("abort", abort, { once: true });

    return {
        signal: controller.signal,
        cleanup: () => {
            signalA?.removeEventListener("abort", abort);
            signalB?.removeEventListener("abort", abort);
        }
    };
}

function createTimedFetch(timeoutMs: number): typeof fetch {
    const timedFetch = (async (input, init) => {
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
        const merged = combineAbortSignals(
            init?.signal instanceof AbortSignal ? init.signal : null,
            timeoutController.signal
        );

        try {
            return await fetch(input, {
                ...init,
                signal: merged.signal
            });
        } finally {
            clearTimeout(timeoutId);
            merged.cleanup();
        }
    }) as typeof fetch;

    timedFetch.preconnect = globalThis.fetch.preconnect?.bind(globalThis.fetch);

    return timedFetch;
}

function isPrivateHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase();

    return (
        normalized === "localhost" ||
        normalized.endsWith(".localhost") ||
        normalized.endsWith(".local") ||
        normalized === "host.docker.internal" ||
        normalized === "0.0.0.0" ||
        normalized === "::1" ||
        normalized.startsWith("127.") ||
        normalized.startsWith("10.") ||
        normalized.startsWith("192.168.") ||
        normalized.startsWith("169.254.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        normalized.startsWith("fe80:")
    );
}

function assertRemoteUrl(urlValue: string) {
    let parsed: URL;

    try {
        parsed = new URL(urlValue);
    } catch {
        throw new Error("MCP server URL is invalid.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only HTTP and HTTPS MCP servers are supported.");
    }

    if (parsed.username || parsed.password) {
        throw new Error("MCP server URLs must not embed credentials.");
    }

    if (!env.allowPrivateMcpUrls && isPrivateHostname(parsed.hostname)) {
        throw new Error(
            "Private and localhost MCP URLs are blocked in this environment."
        );
    }
}

export async function connectToMcpServer(server: ResolvedUserMcpServer) {
    assertRemoteUrl(server.url);

    const headers = new Headers();

    if (server.authMode === "bearer" && server.authToken) {
        headers.set("Authorization", `Bearer ${server.authToken}`);
    }

    if (server.authMode === "header" && server.authHeaderName && server.authToken) {
        headers.set(server.authHeaderName, server.authToken);
    }

    const transport = new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: {
            headers
        },
        fetch: createTimedFetch(MCP_REQUEST_TIMEOUT_MS)
    });

    const client = new Client({
        name: "unbound",
        version: "1.0.0"
    });

    await client.connect(transport);

    return {
        client,
        transport,
        async close() {
            await transport.close().catch(() => undefined);
        }
    };
}

export async function inspectMcpServer(
    server: ResolvedUserMcpServer
): Promise<McpConnectionSnapshot> {
    const connection = await connectToMcpServer(server);

    try {
        const result = await connection.client.listTools();

        return {
            toolCount: result.tools.length,
            discoveredTools: result.tools.map((toolDef) => ({
                name: toolDef.name,
                title: toolDef.title ?? null,
                description: toolDef.description ?? null,
                readOnlyHint: toolDef.annotations?.readOnlyHint ?? false,
                destructiveHint: toolDef.annotations?.destructiveHint ?? false,
                idempotentHint: toolDef.annotations?.idempotentHint ?? false,
                openWorldHint: toolDef.annotations?.openWorldHint ?? false
            }))
        };
    } finally {
        await connection.close();
    }
}

export async function createMcpToolsForServers(input: {
    servers: ResolvedUserMcpServer[];
    conversationId: string;
    userId: string;
    onHealthSuccess?: (serverId: string, snapshot: McpConnectionSnapshot) => Promise<void>;
    onHealthError?: (serverId: string, error: string) => Promise<void>;
}): Promise<{
    tools: McpToolSet;
    cleanup: () => Promise<void>;
}> {
    const tools: McpToolSet = {};
    const closers: Array<() => Promise<void>> = [];

    for (const server of input.servers) {
        try {
            const connection = await connectToMcpServer(server);
            const listedTools = await connection.client.listTools();
            const snapshot: McpConnectionSnapshot = {
                toolCount: listedTools.tools.length,
                discoveredTools: listedTools.tools.map((toolDef) => ({
                    name: toolDef.name,
                    title: toolDef.title ?? null,
                    description: toolDef.description ?? null,
                    readOnlyHint: toolDef.annotations?.readOnlyHint ?? false,
                    destructiveHint: toolDef.annotations?.destructiveHint ?? false,
                    idempotentHint: toolDef.annotations?.idempotentHint ?? false,
                    openWorldHint: toolDef.annotations?.openWorldHint ?? false
                }))
            };

            await input.onHealthSuccess?.(server.id, snapshot);
            closers.push(() => connection.close());

            const allowed = server.allowedTools ? new Set(server.allowedTools) : null;
            const usedNames = new Set(Object.keys(tools));

            listedTools.tools.forEach((toolDef, index) => {
                if (allowed && !allowed.has(toolDef.name)) {
                    return;
                }

                let exposedName = buildExposedToolName(
                    server.toolPrefix,
                    toolDef.name,
                    index
                );
                let collisionIndex = 1;

                while (usedNames.has(exposedName)) {
                    collisionIndex += 1;
                    exposedName = buildExposedToolName(
                        `${server.toolPrefix}_${collisionIndex}`,
                        toolDef.name,
                        index
                    );
                }

                usedNames.add(exposedName);

                tools[exposedName] = tool({
                    description: describeMcpTool({
                        serverName: server.name,
                        toolName: toolDef.name,
                        description: toolDef.description,
                        annotations: toolDef.annotations
                    }),
                    inputSchema: jsonSchemaToZod(
                        toolDef.inputSchema as JsonSchemaObject | undefined
                    ),
                    execute: async (args) => {
                        logger.info("MCP tool started", {
                            conversationId: input.conversationId,
                            userId: input.userId,
                            serverId: server.id,
                            serverName: server.name,
                            toolName: toolDef.name,
                            exposedToolName: exposedName
                        });

                        const result = await connection.client.callTool({
                            name: toolDef.name,
                            arguments: (args as Record<string, unknown>) ?? {}
                        });

                        return normalizeToolResult(result);
                    }
                });
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown MCP connection error.";

            logger.warn("MCP server skipped during tool creation", {
                conversationId: input.conversationId,
                userId: input.userId,
                serverId: server.id,
                serverName: server.name,
                error: message
            });

            await input.onHealthError?.(server.id, message);
        }
    }

    let cleanedUp = false;

    return {
        tools,
        async cleanup() {
            if (cleanedUp) {
                return;
            }

            cleanedUp = true;

            await Promise.allSettled(closers.map((close) => close()));
        }
    };
}
