import type { InferSelectModel } from "drizzle-orm";
import {
    userMcpServers,
    type UserMcpDiscoveredToolRecord
} from "../../db/schema";
import { AppError } from "../../lib/app-error";

export type UserMcpServerRecord = InferSelectModel<typeof userMcpServers>;

export type McpTransportType = "streamable_http";
export type McpAuthMode = "none" | "bearer" | "header";
export type McpHealthStatus = "unknown" | "healthy" | "error";

export interface UserMcpServerSummary {
    id: string;
    name: string;
    transport: McpTransportType;
    enabled: boolean;
    url: string;
    urlPreview: string;
    authMode: McpAuthMode;
    authHeaderName: string | null;
    hasAuthToken: boolean;
    authTokenPreview: string | null;
    toolPrefix: string;
    allowAllTools: boolean;
    allowedTools: string[];
    discoveredTools: UserMcpDiscoveredToolRecord[];
    lastHealthStatus: McpHealthStatus;
    lastHealthError: string | null;
    lastConnectedAt: string | null;
    lastDiscoveredAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface UpsertMcpServerInput {
    name: string;
    url: string;
    authMode: McpAuthMode;
    authHeaderName?: string;
    authToken?: string;
    keepExistingAuthToken?: boolean;
    enabled: boolean;
    toolPrefix: string;
    allowAllTools: boolean;
    allowedTools?: string[];
}

export interface ResolvedUserMcpServer {
    id: string;
    userId: string;
    name: string;
    transport: McpTransportType;
    enabled: boolean;
    url: string;
    authMode: McpAuthMode;
    authHeaderName: string | null;
    authToken: string | null;
    toolPrefix: string;
    allowedTools: string[] | null;
}

export interface McpConnectionSnapshot {
    toolCount: number;
    discoveredTools: UserMcpDiscoveredToolRecord[];
}

export class McpError extends AppError {}

export function normalizeHealthStatus(
    value: string | null | undefined
): McpHealthStatus {
    return value === "healthy" || value === "error" || value === "unknown"
        ? value
        : "unknown";
}

export function toMcpServerSummary(input: {
    record: UserMcpServerRecord;
    url: string;
}): UserMcpServerSummary {
    const { record, url } = input;

    return {
        id: record.id,
        name: record.name,
        transport: record.transport as McpTransportType,
        enabled: record.enabled,
        url,
        urlPreview: record.urlPreview,
        authMode: record.authMode as McpAuthMode,
        authHeaderName: record.authHeaderName ?? null,
        hasAuthToken: record.authTokenCiphertext !== null,
        authTokenPreview: record.authTokenPreview ?? null,
        toolPrefix: record.toolPrefix,
        allowAllTools: record.allowedTools === null,
        allowedTools: record.allowedTools ?? [],
        discoveredTools: record.discoveredTools,
        lastHealthStatus: normalizeHealthStatus(record.lastHealthStatus),
        lastHealthError: record.lastHealthError ?? null,
        lastConnectedAt: record.lastConnectedAt?.toISOString() ?? null,
        lastDiscoveredAt: record.lastDiscoveredAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString()
    };
}
