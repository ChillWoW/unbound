import { randomBytes } from "node:crypto";
import { requireVerifiedAuth } from "../../middleware/require-auth";
import { settingsRepository } from "../settings/settings.repository";
import { toMemorySettingsSummary } from "../settings/settings.types";
import { memoryRepository } from "./memory.repository";
import {
    MemoryError,
    confidenceToRank,
    isMemoryConfidence,
    MEMORY_KINDS,
    type MemoryConfidence,
    type MemoryKind,
    type MemorySearchFilters,
    type MemorySource,
    type MemorySummary,
    type MemoryUpdateInput,
    type MemoryWriteInput,
    type MemoryWritePolicy,
    type UserMemoryRecord,
    toMemorySummary
} from "./memory.types";

const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 25;
const MAX_MEMORY_CONTENT_LENGTH = 400;
const MAX_REASON_LENGTH = 240;
const MAX_KEYWORD_LENGTH = 32;
const MAX_KEYWORDS = 8;
const PROMPT_GLOBAL_MEMORY_LIMIT = 3;
const PROMPT_RELEVANT_MEMORY_LIMIT = 4;

const SECRET_PATTERNS = [
    /\b(api[-_ ]?key|token|secret|password|credential|private key)\b/i,
    /sk-[a-z0-9_-]{8,}/i,
    /AIza[0-9A-Za-z\-_]{12,}/,
    /ghp_[A-Za-z0-9]{20,}/
];

const SENSITIVE_PATTERNS = [
    /\b(ssn|social security|credit card|passport|driver'?s license)\b/i,
    /\b(home address|street address|phone number)\b/i,
    /\b(medical|diagnosis|health condition|religion|political)\b/i,
    /\b(race|ethnicity|sexual orientation)\b/i
];

const TEMPORARY_PATTERNS = [
    /\b(right now|for now|this session|temporary|until tomorrow)\b/i,
    /\b(today|tomorrow|this week|this month)\b/i,
    /\bcurrent task|todo\b/i
];

function createMemoryId(): string {
    return `mem_${randomBytes(10).toString("hex")}`;
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function normalizeContent(value: string): string {
    return normalizeWhitespace(value).replace(/^[-:*\s]+/, "");
}

function normalizeReason(value: string): string {
    return normalizeWhitespace(value);
}

function tokenize(value: string): string[] {
    return Array.from(
        new Set(
            normalizeWhitespace(value)
                .toLowerCase()
                .split(/[^a-z0-9_]+/)
                .filter((token) => token.length >= 3)
        )
    );
}

function normalizeKeywords(value: string[], content: string): string[] {
    return Array.from(
        new Set(
            [...value, ...tokenize(content)]
                .map((keyword) => keyword.trim().toLowerCase())
                .filter(
                    (keyword) =>
                        keyword.length >= 3 && keyword.length <= MAX_KEYWORD_LENGTH
                )
        )
    ).slice(0, MAX_KEYWORDS);
}

function confidenceMeetsMinimum(
    value: MemoryConfidence,
    minimum: MemoryConfidence
): boolean {
    return confidenceToRank(value) >= confidenceToRank(minimum);
}

function daysSince(value: Date): number {
    return Math.max(0, (Date.now() - value.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeSource(input: MemorySource): MemorySource {
    const reason = normalizeReason(input.reason);

    if (!reason) {
        throw new MemoryError(400, "Memory source reason is required.");
    }

    if (reason.length > MAX_REASON_LENGTH) {
        throw new MemoryError(
            400,
            `Memory source reason must be ${MAX_REASON_LENGTH} characters or less.`
        );
    }

    return {
        origin: input.origin,
        reason,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
        excerpt: input.excerpt ? normalizeWhitespace(input.excerpt).slice(0, 240) : null
    };
}

function assertCandidateAllowed(
    policy: MemoryWritePolicy,
    kind: MemoryKind,
    content: string,
    confidence: MemoryConfidence
) {
    if (!policy.enabled) {
        throw new MemoryError(400, "Memory is disabled in settings.");
    }

    if (!policy.allowedKinds[kind]) {
        throw new MemoryError(
            400,
            `Saving ${kind.replace(/_/g, " ")} memories is disabled by policy.`
        );
    }

    if (!confidenceMeetsMinimum(confidence, policy.minConfidence)) {
        throw new MemoryError(
            400,
            `Memory confidence must be ${policy.minConfidence} or higher.`
        );
    }

    if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) {
        throw new MemoryError(400, "Do not save secrets or credentials to memory.");
    }

    if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(content))) {
        throw new MemoryError(
            400,
            "Do not save sensitive or creepy personal information to memory."
        );
    }

    if (TEMPORARY_PATTERNS.some((pattern) => pattern.test(content))) {
        throw new MemoryError(
            400,
            "This looks too temporary to store as durable memory."
        );
    }
}

function normalizeWriteInput(
    input: MemoryWriteInput,
    policy: MemoryWritePolicy
): MemoryWriteInput {
    const content = normalizeContent(input.content);

    if (!content) {
        throw new MemoryError(400, "Memory content is required.");
    }

    if (content.length > MAX_MEMORY_CONTENT_LENGTH) {
        throw new MemoryError(
            400,
            `Memory content must be ${MAX_MEMORY_CONTENT_LENGTH} characters or less.`
        );
    }

    assertCandidateAllowed(policy, input.kind, content, input.confidence);

    return {
        ...input,
        content,
        keywords: normalizeKeywords(input.keywords ?? [], content),
        source: normalizeSource(input.source)
    };
}

function normalizeUpdateInput(
    current: UserMemoryRecord,
    input: MemoryUpdateInput,
    policy: MemoryWritePolicy
) {
    const kind = input.kind ?? (current.kind as MemoryKind);
    const confidence = input.confidence ?? (current.confidence as MemoryConfidence);
    const content =
        input.content !== undefined ? normalizeContent(input.content) : current.content;

    if (!content) {
        throw new MemoryError(400, "Memory content is required.");
    }

    assertCandidateAllowed(policy, kind, content, confidence);

    return {
        kind,
        content,
        confidence,
        keywords:
            input.keywords !== undefined
                ? normalizeKeywords(input.keywords, content)
                : current.keywords,
        source:
            input.source !== undefined
                ? normalizeSource(input.source)
                : current.source
    };
}

function scoreMemory(record: UserMemoryRecord, query: string | undefined): number {
    const content = `${record.content} ${(record.keywords ?? []).join(" ")}`.toLowerCase();
    const queryText = normalizeWhitespace(query ?? "").toLowerCase();
    const tokens = tokenize(queryText);
    let score = confidenceToRank(record.confidence as MemoryConfidence) * 50;

    if (queryText) {
        if (content.includes(queryText)) {
            score += 60;
        }

        for (const token of tokens) {
            if (content.includes(token)) {
                score += 15;
            }
        }
    }

    score += Math.max(0, 20 - daysSince(record.updatedAt) / 7);
    score += Math.max(0, 12 - daysSince(record.lastAccessedAt ?? record.updatedAt) / 10);

    return score;
}

function matchesQuery(record: UserMemoryRecord, query: string | undefined): boolean {
    const queryText = normalizeWhitespace(query ?? "").toLowerCase();

    if (!queryText) {
        return true;
    }

    const haystack = `${record.content} ${(record.keywords ?? []).join(" ")}`.toLowerCase();

    if (haystack.includes(queryText)) {
        return true;
    }

    return tokenize(queryText).some((token) => haystack.includes(token));
}

function dedupeMemories(records: UserMemoryRecord[]): UserMemoryRecord[] {
    const seen = new Set<string>();
    const unique: UserMemoryRecord[] = [];

    for (const record of records) {
        if (seen.has(record.id)) {
            continue;
        }

        seen.add(record.id);
        unique.push(record);
    }

    return unique;
}

function sortForGlobalPrompt(
    left: UserMemoryRecord,
    right: UserMemoryRecord
): number {
    const confidenceDelta =
        confidenceToRank(right.confidence as MemoryConfidence) -
        confidenceToRank(left.confidence as MemoryConfidence);

    if (confidenceDelta !== 0) {
        return confidenceDelta;
    }

    return right.updatedAt.getTime() - left.updatedAt.getTime();
}

function filterByMinimumConfidence(
    records: UserMemoryRecord[],
    minConfidence: MemoryConfidence
): UserMemoryRecord[] {
    return records.filter((record) =>
        confidenceMeetsMinimum(record.confidence as MemoryConfidence, minConfidence)
    );
}

function getPromptMemories(
    records: UserMemoryRecord[],
    query: string | undefined,
    minConfidence: MemoryConfidence
): UserMemoryRecord[] {
    const eligible = filterByMinimumConfidence(records, minConfidence);

    const globalMemories = eligible
        .filter(
            (record) =>
                record.kind === "preference" || record.kind === "workflow"
        )
        .sort(sortForGlobalPrompt)
        .slice(0, PROMPT_GLOBAL_MEMORY_LIMIT);

    const relevantMemories = eligible
        .filter((record) => matchesQuery(record, query))
        .sort((left, right) => {
            const scoreDelta = scoreMemory(right, query) - scoreMemory(left, query);

            if (scoreDelta !== 0) {
                return scoreDelta;
            }

            return right.updatedAt.getTime() - left.updatedAt.getTime();
        })
        .slice(0, PROMPT_RELEVANT_MEMORY_LIMIT);

    return dedupeMemories([...globalMemories, ...relevantMemories]);
}

async function getPolicyForUser(userId: string): Promise<MemoryWritePolicy> {
    const settings = await settingsRepository.findByUserId(userId);
    return toMemorySettingsSummary(settings);
}

async function getRankedMemories(
    userId: string,
    filters: MemorySearchFilters
): Promise<UserMemoryRecord[]> {
    const allMemories = await memoryRepository.listByUserId(userId);
    const limit = Math.min(
        Math.max(filters.limit ?? DEFAULT_SEARCH_LIMIT, 1),
        MAX_SEARCH_LIMIT
    );

    return allMemories
        .filter((memory) => {
            if (filters.kind && memory.kind !== filters.kind) {
                return false;
            }

            if (
                filters.minConfidence &&
                !confidenceMeetsMinimum(
                    memory.confidence as MemoryConfidence,
                    filters.minConfidence
                )
            ) {
                return false;
            }

            return matchesQuery(memory, filters.query);
        })
        .sort((left, right) => {
            const scoreDelta = scoreMemory(right, filters.query) - scoreMemory(left, filters.query);

            if (scoreDelta !== 0) {
                return scoreDelta;
            }

            return right.updatedAt.getTime() - left.updatedAt.getTime();
        })
        .slice(0, limit);
}

async function upsertMemory(
    userId: string,
    input: MemoryWriteInput,
    existingMemories?: UserMemoryRecord[]
) {
    const policy = await getPolicyForUser(userId);
    const normalized = normalizeWriteInput(input, policy);
    const memories = existingMemories ?? (await memoryRepository.listByUserId(userId));
    const duplicate = memories.find(
        (memory) =>
            normalizeContent(memory.content).toLowerCase() ===
            normalized.content.toLowerCase()
    );

    if (duplicate) {
        const updated = await memoryRepository.updateMemory(userId, duplicate.id, {
            kind: normalized.kind,
            content: normalized.content,
            confidence:
                confidenceToRank(normalized.confidence) >=
                confidenceToRank(duplicate.confidence as MemoryConfidence)
                    ? normalized.confidence
                    : (duplicate.confidence as MemoryConfidence),
            keywords: normalizeKeywords(
                [...duplicate.keywords, ...(normalized.keywords ?? [])],
                normalized.content
            ),
            source: normalized.source
        });

        if (!updated) {
            throw new Error("Failed to update duplicate memory.");
        }

        return { action: "updated_existing" as const, memory: updated };
    }

    const created = await memoryRepository.insertMemory({
        id: createMemoryId(),
        userId,
        kind: normalized.kind,
        content: normalized.content,
        confidence: normalized.confidence,
        keywords: normalized.keywords ?? [],
        source: normalized.source
    });

    return { action: "created" as const, memory: created };
}

export function buildMemoryPromptBlock(
    policy: MemoryWritePolicy,
    memories: MemorySummary[]
): string {
    const allowedKinds = MEMORY_KINDS.filter((kind) => policy.allowedKinds[kind]);

    if (!policy.enabled) {
        return [
            "Memory system:",
            "- Durable user memory is disabled in settings.",
            "- Do not rely on or write memory unless the user explicitly asks to re-enable it."
        ].join("\n");
    }

    const lines = [
        "Memory system:",
        "- Save only durable user-benefiting preferences, workflows, profile details, or recurring project context.",
        "- Only write or update memory when the user explicitly asks you to remember something.",
        "- Never save secrets, credentials, temporary details, or sensitive/creepy personal data.",
        "- Apply saved preferences and workflow defaults proactively across conversations unless the user explicitly overrides them.",
        `- Minimum memory confidence: ${policy.minConfidence}.`,
        `- Allowed memory kinds: ${allowedKinds.join(", ") || "none"}.`,
        "- Prefer updating existing memories instead of creating duplicates."
    ];

    if (policy.customInstructions) {
        lines.push(`- User memory policy note: ${policy.customInstructions}`);
    }

    if (memories.length > 0) {
        lines.push(
            "- Active durable memory to follow when answering, choosing commands, or suggesting tools:"
        );

        for (const memory of memories) {
            lines.push(
                `  - [${memory.confidence}] [${memory.kind}] ${memory.content} (source: ${memory.source.reason})`
            );
        }
    }

    return lines.join("\n");
}

export const memoryService = {
    async listMemories(
        request: Request,
        filters: MemorySearchFilters
    ): Promise<{ memories: MemorySummary[] }> {
        const user = await requireVerifiedAuth(request);
        const memories = await getRankedMemories(user.id, filters);

        return {
            memories: memories.map(toMemorySummary)
        };
    },

    async deleteMemory(request: Request, memoryId: string) {
        const user = await requireVerifiedAuth(request);
        const deleted = await memoryRepository.deleteMemory(user.id, memoryId);

        if (!deleted) {
            throw new MemoryError(404, "Memory not found.");
        }

        return { success: true, memoryId };
    },

    async searchMemoriesForTool(userId: string, filters: MemorySearchFilters) {
        const policy = await getPolicyForUser(userId);

        if (!policy.enabled) {
            throw new MemoryError(400, "Memory is disabled in settings.");
        }

        const memories = await getRankedMemories(userId, {
            ...filters,
            minConfidence: filters.minConfidence ?? policy.minConfidence
        });

        await memoryRepository.touchMemories(
            userId,
            memories.map((memory) => memory.id)
        );

        return {
            query: filters.query?.trim() || null,
            memories: memories.map(toMemorySummary)
        };
    },

    async saveMemoryForTool(
        userId: string,
        conversationId: string,
        input: {
            kind: MemoryKind;
            content: string;
            confidence: MemoryConfidence;
            reason: string;
            keywords?: string[];
        }
    ) {
        const result = await upsertMemory(userId, {
            kind: input.kind,
            content: input.content,
            confidence: input.confidence,
            keywords: input.keywords,
            source: {
                origin: "tool",
                reason: input.reason,
                conversationId,
                messageId: null,
                excerpt: input.content
            }
        });

        return {
            action: result.action,
            memory: toMemorySummary(result.memory)
        };
    },

    async updateMemoryForTool(
        userId: string,
        conversationId: string,
        input: {
            memoryId: string;
            kind?: MemoryKind;
            content?: string;
            confidence?: MemoryConfidence;
            reason: string;
            keywords?: string[];
        }
    ) {
        const policy = await getPolicyForUser(userId);

        if (!policy.enabled) {
            throw new MemoryError(400, "Memory is disabled in settings.");
        }

        const current = await memoryRepository.findByIdForUser(userId, input.memoryId);

        if (!current) {
            throw new MemoryError(404, "Memory not found.");
        }

        if (
            input.kind === undefined &&
            input.content === undefined &&
            input.confidence === undefined &&
            input.keywords === undefined
        ) {
            throw new MemoryError(400, "Provide at least one memory field to update.");
        }

        const normalized = normalizeUpdateInput(current, {
            kind: input.kind,
            content: input.content,
            confidence: input.confidence,
            keywords: input.keywords,
            source: {
                origin: "tool",
                reason: input.reason,
                conversationId,
                messageId: null,
                excerpt: input.content ?? current.content
            }
        }, policy);

        const updated = await memoryRepository.updateMemory(userId, input.memoryId, normalized);

        if (!updated) {
            throw new Error("Failed to update memory.");
        }

        return {
            memory: toMemorySummary(updated)
        };
    },

    async deleteMemoryForTool(userId: string, memoryId: string) {
        const policy = await getPolicyForUser(userId);

        if (!policy.enabled) {
            throw new MemoryError(400, "Memory is disabled in settings.");
        }

        const deleted = await memoryRepository.deleteMemory(userId, memoryId);

        if (!deleted) {
            throw new MemoryError(404, "Memory not found.");
        }

        return {
            success: true,
            memoryId
        };
    },

    async getPromptBlockForUser(userId: string, query?: string): Promise<string> {
        const policy = await getPolicyForUser(userId);

        if (!policy.enabled) {
            return buildMemoryPromptBlock(policy, []);
        }

        const allMemories = await memoryRepository.listByUserId(userId);
        const memories = getPromptMemories(
            allMemories,
            query,
            policy.minConfidence
        );

        await memoryRepository.touchMemories(
            userId,
            memories.map((memory) => memory.id)
        );

        return buildMemoryPromptBlock(
            policy,
            memories.map(toMemorySummary)
        );
    }
};
