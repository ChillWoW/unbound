import { randomBytes } from "node:crypto";
import { env } from "../../config/env";
import { decryptText, encryptText } from "../../lib/encryption";
import { logger } from "../../lib/logger";
import { requireVerifiedAuth } from "../../middleware/require-auth";
import { inspectMcpServer } from "./mcp-runtime";
import { mcpRepository } from "./mcp.repository";
import {
    McpError,
    toMcpServerSummary,
    type McpAuthMode,
    type McpConnectionSnapshot,
    type ResolvedUserMcpServer,
    type UpsertMcpServerInput,
    type UserMcpServerRecord
} from "./mcp.types";

const MCP_NAME_MAX_LENGTH = 80;
const MCP_URL_MAX_LENGTH = 1000;
const MCP_AUTH_TOKEN_MAX_LENGTH = 2000;
const MCP_HEADER_NAME_MAX_LENGTH = 100;
const MCP_TOOL_PREFIX_MAX_LENGTH = 32;
const MCP_MAX_ALLOWED_TOOLS = 200;
const MCP_MAX_HEALTH_ERROR_LENGTH = 500;

function createServerId(): string {
    return `mcp_${randomBytes(10).toString("hex")}`;
}

function normalizeName(value: string): string {
    const normalized = value.trim();

    if (!normalized) {
        throw new McpError(400, "MCP server name is required.");
    }

    if (normalized.length > MCP_NAME_MAX_LENGTH) {
        throw new McpError(
            400,
            `MCP server name must be ${MCP_NAME_MAX_LENGTH} characters or fewer.`
        );
    }

    return normalized;
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

function normalizeUrl(value: string): string {
    const trimmed = value.trim();

    if (!trimmed) {
        throw new McpError(400, "MCP server URL is required.");
    }

    if (trimmed.length > MCP_URL_MAX_LENGTH) {
        throw new McpError(400, "MCP server URL is too long.");
    }

    let parsed: URL;

    try {
        parsed = new URL(trimmed);
    } catch {
        throw new McpError(400, "MCP server URL is invalid.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new McpError(
            400,
            "Only HTTP and HTTPS MCP servers are supported right now."
        );
    }

    if (parsed.username || parsed.password) {
        throw new McpError(
            400,
            "MCP server URL must not include embedded credentials."
        );
    }

    if (!env.allowPrivateMcpUrls && isPrivateHostname(parsed.hostname)) {
        throw new McpError(
            400,
            "Private and localhost MCP URLs are blocked in this environment."
        );
    }

    return parsed.toString();
}

function createUrlPreview(value: string): string {
    const parsed = new URL(value);
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.origin}${pathname}`;
}

function normalizeAuthMode(value: string): McpAuthMode {
    if (value === "none" || value === "bearer" || value === "header") {
        return value;
    }

    throw new McpError(400, `Unsupported MCP auth mode: ${value}`);
}

function normalizeAuthHeaderName(value: string | undefined): string {
    const normalized = value?.trim() ?? "";

    if (!normalized) {
        throw new McpError(400, "Header auth requires a header name.");
    }

    if (normalized.length > MCP_HEADER_NAME_MAX_LENGTH) {
        throw new McpError(400, "MCP auth header name is too long.");
    }

    if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
        throw new McpError(
            400,
            "MCP auth header name may only contain letters, numbers, dashes, and underscores."
        );
    }

    return normalized;
}

function normalizeAuthToken(value: string): string {
    const normalized = value.trim();

    if (!normalized) {
        throw new McpError(400, "MCP auth token is required.");
    }

    if (normalized.length > MCP_AUTH_TOKEN_MAX_LENGTH) {
        throw new McpError(400, "MCP auth token is too long.");
    }

    return normalized;
}

function createTokenPreview(value: string): string {
    return `********${value.slice(-4)}`;
}

function normalizeToolPrefix(value: string): string {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, MCP_TOOL_PREFIX_MAX_LENGTH);

    if (!normalized) {
        throw new McpError(
            400,
            "Tool prefix must include at least one letter or number."
        );
    }

    return normalized;
}

function normalizeAllowedTools(input: {
    allowAllTools: boolean;
    allowedTools?: string[];
}) {
    if (input.allowAllTools) {
        return null;
    }

    const normalized = Array.from(
        new Set(
            (input.allowedTools ?? [])
                .map((toolName) => toolName.trim())
                .filter((toolName) => toolName.length > 0)
        )
    );

    if (normalized.length > MCP_MAX_ALLOWED_TOOLS) {
        throw new McpError(400, "Too many allowed MCP tools selected.");
    }

    return normalized;
}

function sanitizeHealthError(value: string): string {
    const normalized = value.trim() || "Unknown MCP error.";
    return normalized.length <= MCP_MAX_HEALTH_ERROR_LENGTH
        ? normalized
        : `${normalized.slice(0, MCP_MAX_HEALTH_ERROR_LENGTH - 3).trimEnd()}...`;
}

function decryptServerUrl(record: UserMcpServerRecord): string {
    return decryptText(record.urlCiphertext, env.settingsEncryptionKey);
}

function decryptServerToken(record: UserMcpServerRecord): string | null {
    if (!record.authTokenCiphertext) {
        return null;
    }

    return decryptText(record.authTokenCiphertext, env.settingsEncryptionKey);
}

async function assertUniqueToolPrefix(
    userId: string,
    toolPrefix: string,
    excludeId?: string
) {
    const existing = await mcpRepository.findByToolPrefix(
        userId,
        toolPrefix,
        excludeId
    );

    if (existing) {
        throw new McpError(
            409,
            `Tool prefix '${toolPrefix}' is already used by another MCP server.`
        );
    }
}

async function toSummary(record: UserMcpServerRecord) {
    return toMcpServerSummary({
        record,
        url: decryptServerUrl(record)
    });
}

function toResolvedServer(record: UserMcpServerRecord): ResolvedUserMcpServer {
    return {
        id: record.id,
        userId: record.userId,
        name: record.name,
        transport: "streamable_http",
        enabled: record.enabled,
        url: decryptServerUrl(record),
        authMode: normalizeAuthMode(record.authMode),
        authHeaderName: record.authHeaderName ?? null,
        authToken: decryptServerToken(record),
        toolPrefix: record.toolPrefix,
        allowedTools: record.allowedTools
    };
}

async function buildWritePayload(input: {
    existing: UserMcpServerRecord | null;
    values: UpsertMcpServerInput;
}) {
    const name = normalizeName(input.values.name);
    const url = normalizeUrl(input.values.url);
    const authMode = normalizeAuthMode(input.values.authMode);
    const toolPrefix = normalizeToolPrefix(input.values.toolPrefix);
    const allowedTools = normalizeAllowedTools(input.values);

    let authHeaderName: string | null = null;
    let authToken: string | null = null;

    if (authMode === "header") {
        authHeaderName = normalizeAuthHeaderName(input.values.authHeaderName);
    }

    if (authMode === "none") {
        authToken = null;
    } else if (input.values.authToken?.trim()) {
        authToken = normalizeAuthToken(input.values.authToken);
    } else if (input.values.keepExistingAuthToken && input.existing) {
        authToken = decryptServerToken(input.existing);
    } else if (input.existing?.authTokenCiphertext) {
        authToken = decryptServerToken(input.existing);
    }

    if (authMode !== "none" && !authToken) {
        throw new McpError(400, "This MCP auth mode requires an auth token.");
    }

    return {
        name,
        transport: "streamable_http",
        enabled: input.values.enabled,
        urlCiphertext: encryptText(url, env.settingsEncryptionKey),
        urlPreview: createUrlPreview(url),
        authMode,
        authHeaderName,
        authTokenCiphertext: authToken
            ? encryptText(authToken, env.settingsEncryptionKey)
            : null,
        authTokenPreview: authToken ? createTokenPreview(authToken) : null,
        toolPrefix,
        allowedTools
    };
}

async function updateServerHealth(input: {
    userId: string;
    serverId: string;
    snapshot?: McpConnectionSnapshot;
    error?: string;
}) {
    if (input.snapshot) {
        const now = new Date();
        await mcpRepository.updateConnectionState({
            userId: input.userId,
            serverId: input.serverId,
            status: "healthy",
            error: null,
            discoveredTools: input.snapshot.discoveredTools,
            connectedAt: now,
            discoveredAt: now
        });
        return;
    }

    await mcpRepository.updateConnectionState({
        userId: input.userId,
        serverId: input.serverId,
        status: "error",
        error: sanitizeHealthError(input.error ?? "Unknown MCP error."),
        connectedAt: null,
        discoveredAt: null
    });
}

export const mcpService = {
    async listServers(request: Request) {
        const user = await requireVerifiedAuth(request);
        const records = await mcpRepository.listByUserId(user.id);

        return {
            servers: await Promise.all(records.map((record) => toSummary(record)))
        };
    },

    async createServer(request: Request, input: UpsertMcpServerInput) {
        const user = await requireVerifiedAuth(request);
        const payload = await buildWritePayload({ existing: null, values: input });

        await assertUniqueToolPrefix(user.id, payload.toolPrefix);

        const server = await mcpRepository.create({
            id: createServerId(),
            userId: user.id,
            ...payload
        });

        return {
            server: await toSummary(server)
        };
    },

    async updateServer(
        request: Request,
        serverId: string,
        input: UpsertMcpServerInput
    ) {
        const user = await requireVerifiedAuth(request);
        const existing = await mcpRepository.findByIdForUser(user.id, serverId);

        if (!existing) {
            throw new McpError(404, "MCP server not found.");
        }

        const payload = await buildWritePayload({
            existing,
            values: input
        });

        await assertUniqueToolPrefix(user.id, payload.toolPrefix, serverId);

        const updated = await mcpRepository.update({
            userId: user.id,
            serverId,
            ...payload
        });

        return {
            server: await toSummary(updated)
        };
    },

    async deleteServer(request: Request, serverId: string) {
        const user = await requireVerifiedAuth(request);
        const deleted = await mcpRepository.delete(user.id, serverId);

        if (!deleted) {
            throw new McpError(404, "MCP server not found.");
        }

        return {
            success: true,
            serverId
        };
    },

    async testServer(request: Request, serverId: string) {
        const user = await requireVerifiedAuth(request);
        const server = await mcpRepository.findByIdForUser(user.id, serverId);

        if (!server) {
            throw new McpError(404, "MCP server not found.");
        }

        const resolved = toResolvedServer(server);

        try {
            const snapshot = await inspectMcpServer(resolved);
            await updateServerHealth({
                userId: user.id,
                serverId,
                snapshot
            });

            const refreshed = await mcpRepository.findByIdForUser(user.id, serverId);

            if (!refreshed) {
                throw new McpError(404, "MCP server not found after refresh.");
            }

            return {
                ok: true,
                toolCount: snapshot.toolCount,
                server: await toSummary(refreshed)
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown MCP error.";
            await updateServerHealth({
                userId: user.id,
                serverId,
                error: message
            });

            throw new McpError(400, `MCP connection failed: ${sanitizeHealthError(message)}`);
        }
    },

    async listEnabledServersForRuntime(userId: string) {
        const records = await mcpRepository.listEnabledByUserId(userId);
        return records.map((record) => toResolvedServer(record));
    },

    async markRuntimeServerHealthy(
        userId: string,
        serverId: string,
        snapshot: McpConnectionSnapshot
    ) {
        try {
            await updateServerHealth({ userId, serverId, snapshot });
        } catch (error) {
            logger.warn("Failed to mark MCP server healthy", {
                userId,
                serverId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    },

    async markRuntimeServerError(userId: string, serverId: string, error: string) {
        try {
            await updateServerHealth({ userId, serverId, error });
        } catch (updateError) {
            logger.warn("Failed to mark MCP server unhealthy", {
                userId,
                serverId,
                error:
                    updateError instanceof Error
                        ? updateError.message
                        : String(updateError)
            });
        }
    }
};
