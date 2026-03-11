import type { InferSelectModel } from "drizzle-orm";
import { userMemories } from "../../db/schema";
import { AppError } from "../../lib/app-error";

export const MEMORY_KINDS = [
    "preference",
    "workflow",
    "profile",
    "project_context"
] as const;

export const MEMORY_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export const MEMORY_ORIGINS = ["tool"] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryConfidence = (typeof MEMORY_CONFIDENCE_LEVELS)[number];
export type MemoryOrigin = (typeof MEMORY_ORIGINS)[number];

export interface MemorySource {
    origin: MemoryOrigin;
    reason: string;
    conversationId: string | null;
    messageId: string | null;
    excerpt: string | null;
}

export type UserMemoryRecord = InferSelectModel<typeof userMemories>;

export interface MemorySummary {
    id: string;
    kind: MemoryKind;
    content: string;
    confidence: MemoryConfidence;
    keywords: string[];
    source: MemorySource;
    createdAt: string;
    updatedAt: string;
    lastAccessedAt: string | null;
}

export interface MemorySearchFilters {
    query?: string;
    kind?: MemoryKind | null;
    minConfidence?: MemoryConfidence;
    limit?: number;
}

export interface MemoryWritePolicy {
    enabled: boolean;
    minConfidence: MemoryConfidence;
    allowedKinds: Record<MemoryKind, boolean>;
    customInstructions: string | null;
}

export interface MemoryWriteInput {
    kind: MemoryKind;
    content: string;
    confidence: MemoryConfidence;
    keywords?: string[];
    source: MemorySource;
}

export interface MemoryUpdateInput {
    kind?: MemoryKind;
    content?: string;
    confidence?: MemoryConfidence;
    keywords?: string[];
    source?: MemorySource;
}

export { AppError as MemoryError };

export function isMemoryKind(value: string): value is MemoryKind {
    return MEMORY_KINDS.includes(value as MemoryKind);
}

export function isMemoryConfidence(value: string): value is MemoryConfidence {
    return MEMORY_CONFIDENCE_LEVELS.includes(value as MemoryConfidence);
}

export function confidenceToRank(value: MemoryConfidence): number {
    switch (value) {
        case "high":
            return 3;
        case "medium":
            return 2;
        default:
            return 1;
    }
}

export function toMemorySummary(record: UserMemoryRecord): MemorySummary {
    return {
        id: record.id,
        kind: record.kind as MemoryKind,
        content: record.content,
        confidence: record.confidence as MemoryConfidence,
        keywords: record.keywords,
        source: record.source,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        lastAccessedAt: record.lastAccessedAt?.toISOString() ?? null
    };
}
