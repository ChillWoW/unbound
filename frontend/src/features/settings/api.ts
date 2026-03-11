import { api } from "@/lib/api";
import type {
    MemoryConfidence,
    MemoryDeleteResponse,
    MemoryKind,
    MemoryListResponse,
    McpServerDeleteResponse,
    McpServerResponse,
    McpServerTestResponse,
    McpServersResponse,
    ProviderType,
    SettingsResponse,
    UpdateMcpServerInput,
    UpdateMemorySettingsInput
} from "./types";

export const settingsApi = {
    getSettings() {
        return api.get<SettingsResponse>("/api/settings");
    },

    updateProviderApiKey(provider: ProviderType, apiKey: string) {
        return api.put<SettingsResponse>(
            `/api/settings/provider-keys/${provider}`,
            { body: { apiKey } }
        );
    },

    removeProviderApiKey(provider: ProviderType) {
        return api.delete<SettingsResponse>(
            `/api/settings/provider-keys/${provider}`
        );
    },

    updateMemorySettings(input: UpdateMemorySettingsInput) {
        return api.put<SettingsResponse>("/api/settings/memory", {
            body: {
                ...input,
                customInstructions: input.customInstructions ?? ""
            }
        });
    },

    listMcpServers() {
        return api.get<McpServersResponse>("/api/settings/mcp/servers");
    },

    createMcpServer(input: UpdateMcpServerInput) {
        return api.post<McpServerResponse>("/api/settings/mcp/servers", {
            body: input
        });
    },

    updateMcpServer(serverId: string, input: UpdateMcpServerInput) {
        return api.put<McpServerResponse>(`/api/settings/mcp/servers/${serverId}`, {
            body: input
        });
    },

    deleteMcpServer(serverId: string) {
        return api.delete<McpServerDeleteResponse>(
            `/api/settings/mcp/servers/${serverId}`
        );
    },

    testMcpServer(serverId: string) {
        return api.post<McpServerTestResponse>(
            `/api/settings/mcp/servers/${serverId}/test`
        );
    },

    discoverMcpServer(serverId: string) {
        return api.post<McpServerTestResponse>(
            `/api/settings/mcp/servers/${serverId}/discover`
        );
    },

    listMemories(filters?: {
        query?: string;
        kind?: MemoryKind | "all";
        minConfidence?: MemoryConfidence | "all";
        limit?: number;
    }) {
        return api.get<MemoryListResponse>("/api/memories", {
            query: {
                query: filters?.query,
                kind:
                    filters?.kind && filters.kind !== "all"
                        ? filters.kind
                        : undefined,
                minConfidence:
                    filters?.minConfidence && filters.minConfidence !== "all"
                        ? filters.minConfidence
                        : undefined,
                limit: filters?.limit
            }
        });
    },

    deleteMemory(memoryId: string) {
        return api.delete<MemoryDeleteResponse>(`/api/memories/${memoryId}`);
    }
};
