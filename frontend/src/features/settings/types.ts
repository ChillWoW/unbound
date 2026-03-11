import type { ProviderType } from "@/lib/provider-types";

export type { ProviderType };

export type MemoryKind =
    | "preference"
    | "workflow"
    | "profile"
    | "project_context";

export type MemoryConfidence = "low" | "medium" | "high";

export type MemoryOrigin = "tool";
export type McpTransportType = "streamable_http";
export type McpAuthMode = "none" | "bearer" | "header";
export type McpHealthStatus = "unknown" | "healthy" | "error";

export interface ProviderKeyStatus {
    configured: boolean;
    preview: string | null;
    updatedAt: string | null;
}

export interface MemorySourceSummary {
    origin: MemoryOrigin;
    reason: string;
    conversationId: string | null;
    messageId: string | null;
    excerpt: string | null;
}

export interface UserMemorySummary {
    id: string;
    kind: MemoryKind;
    content: string;
    confidence: MemoryConfidence;
    keywords: string[];
    source: MemorySourceSummary;
    createdAt: string;
    updatedAt: string;
    lastAccessedAt: string | null;
}

export interface MemorySettingsSummary {
    enabled: boolean;
    minConfidence: MemoryConfidence;
    allowedKinds: Record<MemoryKind, boolean>;
    customInstructions: string | null;
}

export interface DiscoveredMcpToolSummary {
    name: string;
    title: string | null;
    description: string | null;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
}

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
    discoveredTools: DiscoveredMcpToolSummary[];
    lastHealthStatus: McpHealthStatus;
    lastHealthError: string | null;
    lastConnectedAt: string | null;
    lastDiscoveredAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface UserSettingsSummary {
    providers: Record<ProviderType, ProviderKeyStatus>;
    memory: MemorySettingsSummary;
}

export interface UpdateMemorySettingsInput extends MemorySettingsSummary {}

export interface UpdateMcpServerInput {
    name: string;
    url: string;
    authMode: McpAuthMode;
    authHeaderName: string;
    authToken: string;
    keepExistingAuthToken: boolean;
    enabled: boolean;
    toolPrefix: string;
    allowAllTools: boolean;
    allowedTools: string[];
}

export interface SettingsResponse {
    settings: UserSettingsSummary;
}

export interface McpServersResponse {
    servers: UserMcpServerSummary[];
}

export interface McpServerResponse {
    server: UserMcpServerSummary;
}

export interface McpServerDeleteResponse {
    success: boolean;
    serverId: string;
}

export interface McpServerTestResponse {
    ok: boolean;
    toolCount: number;
    server: UserMcpServerSummary;
}

export interface MemoryListResponse {
    memories: UserMemorySummary[];
}

export interface MemoryDeleteResponse {
    success: boolean;
    memoryId: string;
}
