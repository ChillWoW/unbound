import type { ProviderType } from "@/lib/provider-types";

export type { ProviderType };

export type MemoryKind =
    | "preference"
    | "workflow"
    | "profile"
    | "project_context";

export type MemoryConfidence = "low" | "medium" | "high";

export type MemoryOrigin = "tool";

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

export interface UserSettingsSummary {
    providers: Record<ProviderType, ProviderKeyStatus>;
    memory: MemorySettingsSummary;
}

export interface UpdateMemorySettingsInput extends MemorySettingsSummary {}

export interface SettingsResponse {
    settings: UserSettingsSummary;
}

export interface MemoryListResponse {
    memories: UserMemorySummary[];
}

export interface MemoryDeleteResponse {
    success: boolean;
    memoryId: string;
}
