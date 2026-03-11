import type { ModelSummary } from "./models.types";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

interface CacheEntry {
    models: ModelSummary[];
    configuredProviders: string[];
    timestamp: number;
}

const userCache = new Map<string, CacheEntry>();

function getFreshEntry(userId: string): CacheEntry | null {
    const entry = userCache.get(userId);

    if (!entry) {
        return null;
    }

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        userCache.delete(userId);
        return null;
    }

    return entry;
}

export function getCachedModelsList(userId: string) {
    const entry = getFreshEntry(userId);

    if (!entry) {
        return null;
    }

    return {
        models: entry.models,
        configuredProviders: entry.configuredProviders
    };
}

export function getCachedModel(userId: string, modelId: string): ModelSummary | null {
    return getFreshEntry(userId)?.models.find((model) => model.id === modelId) ?? null;
}

export function updateModelsCache(
    userId: string,
    models: ModelSummary[],
    configuredProviders: string[]
) {
    if (userCache.size >= MAX_CACHE_ENTRIES) {
        userCache.clear();
    }

    userCache.set(userId, {
        models,
        configuredProviders,
        timestamp: Date.now()
    });
}

export function invalidateModelsCache(userId: string) {
    userCache.delete(userId);
}
