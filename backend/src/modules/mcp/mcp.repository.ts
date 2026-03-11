import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../../db/client";
import {
    userMcpServers,
    type UserMcpDiscoveredToolRecord
} from "../../db/schema";

export const mcpRepository = {
    async listByUserId(userId: string) {
        return db
            .select()
            .from(userMcpServers)
            .where(eq(userMcpServers.userId, userId))
            .orderBy(desc(userMcpServers.updatedAt));
    },

    async listEnabledByUserId(userId: string) {
        return db
            .select()
            .from(userMcpServers)
            .where(
                and(
                    eq(userMcpServers.userId, userId),
                    eq(userMcpServers.enabled, true)
                )
            )
            .orderBy(desc(userMcpServers.updatedAt));
    },

    async findByIdForUser(userId: string, serverId: string) {
        const [server] = await db
            .select()
            .from(userMcpServers)
            .where(
                and(
                    eq(userMcpServers.userId, userId),
                    eq(userMcpServers.id, serverId)
                )
            )
            .limit(1);

        return server ?? null;
    },

    async findByToolPrefix(userId: string, toolPrefix: string, excludeId?: string) {
        const conditions = [
            eq(userMcpServers.userId, userId),
            eq(userMcpServers.toolPrefix, toolPrefix)
        ];

        if (excludeId) {
            conditions.push(ne(userMcpServers.id, excludeId));
        }

        const [server] = await db
            .select()
            .from(userMcpServers)
            .where(and(...conditions))
            .limit(1);

        return server ?? null;
    },

    async create(input: {
        id: string;
        userId: string;
        name: string;
        transport: string;
        enabled: boolean;
        urlCiphertext: string;
        urlPreview: string;
        authMode: string;
        authHeaderName: string | null;
        authTokenCiphertext: string | null;
        authTokenPreview: string | null;
        toolPrefix: string;
        allowedTools: string[] | null;
    }) {
        const now = new Date();
        const [server] = await db
            .insert(userMcpServers)
            .values({
                ...input,
                discoveredTools: [],
                lastHealthStatus: "unknown",
                createdAt: now,
                updatedAt: now
            })
            .returning();

        if (!server) {
            throw new Error("Failed to create MCP server.");
        }

        return server;
    },

    async update(input: {
        userId: string;
        serverId: string;
        name: string;
        transport: string;
        enabled: boolean;
        urlCiphertext: string;
        urlPreview: string;
        authMode: string;
        authHeaderName: string | null;
        authTokenCiphertext: string | null;
        authTokenPreview: string | null;
        toolPrefix: string;
        allowedTools: string[] | null;
    }) {
        const [server] = await db
            .update(userMcpServers)
            .set({
                name: input.name,
                transport: input.transport,
                enabled: input.enabled,
                urlCiphertext: input.urlCiphertext,
                urlPreview: input.urlPreview,
                authMode: input.authMode,
                authHeaderName: input.authHeaderName,
                authTokenCiphertext: input.authTokenCiphertext,
                authTokenPreview: input.authTokenPreview,
                toolPrefix: input.toolPrefix,
                allowedTools: input.allowedTools,
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(userMcpServers.userId, input.userId),
                    eq(userMcpServers.id, input.serverId)
                )
            )
            .returning();

        if (!server) {
            throw new Error("Failed to update MCP server.");
        }

        return server;
    },

    async updateConnectionState(input: {
        userId: string;
        serverId: string;
        status: "healthy" | "error";
        error: string | null;
        discoveredTools?: UserMcpDiscoveredToolRecord[];
        connectedAt?: Date | null;
        discoveredAt?: Date | null;
    }) {
        const [server] = await db
            .update(userMcpServers)
            .set({
                lastHealthStatus: input.status,
                lastHealthError: input.error,
                discoveredTools: input.discoveredTools,
                lastConnectedAt: input.connectedAt,
                lastDiscoveredAt: input.discoveredAt,
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(userMcpServers.userId, input.userId),
                    eq(userMcpServers.id, input.serverId)
                )
            )
            .returning();

        return server ?? null;
    },

    async delete(userId: string, serverId: string) {
        const [deleted] = await db
            .delete(userMcpServers)
            .where(
                and(
                    eq(userMcpServers.userId, userId),
                    eq(userMcpServers.id, serverId)
                )
            )
            .returning();

        return deleted ?? null;
    }
};
