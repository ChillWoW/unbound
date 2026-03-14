import type {
    MessageAttachmentRecord,
    MessagePart,
    MessageRecord,
    MessageRole,
    MessageStatus
} from "./conversations.types";
import { conversationsRepository } from "./conversations.repository";

const DEFAULT_SEARCH_LIMIT = 6;
const MAX_SEARCH_LIMIT = 12;
const SNIPPET_LENGTH = 220;
const MAX_QUERY_LENGTH = 240;

export interface ConversationSearchFilters {
    query?: string;
    conversationId?: string;
    dateFrom?: string;
    dateTo?: string;
    model?: string;
    provider?: string;
    role?: MessageRole;
    status?: MessageStatus;
    isFavorite?: boolean;
    deepResearch?: boolean;
    includeCurrentConversation?: boolean;
    includeAttachmentText?: boolean;
    limit?: number;
    sort?: "relevance" | "newest" | "oldest";
}

interface SearchCandidate {
    conversationId: string;
    conversationTitle: string;
    isFavorite: boolean;
    message: MessageRecord;
    attachments: MessageAttachmentRecord[];
    messageText: string;
    attachmentText: string;
    model: string | null;
    provider: string | null;
    deepResearch: boolean;
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
    return Array.from(
        new Set(
            normalizeWhitespace(value)
                .toLowerCase()
                .split(/[^a-z0-9_]+/)
                .filter((token) => token.length >= 2)
        )
    );
}

function truncateText(value: string, maxLength: number): string {
    const normalized = normalizeWhitespace(value);

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function parseOptionalDate(value: string | undefined, label: string): Date | null {
    if (!value?.trim()) {
        return null;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${label} must be a valid ISO date or datetime.`);
    }

    return parsed;
}

function extractMessageText(parts: MessagePart[]): string {
    const text = parts
        .flatMap((part) => {
            switch (part.type) {
                case "text":
                    return [part.text];
                case "image":
                    return [part.filename ? `Image: ${part.filename}` : "Image attachment"];
                case "file":
                    return [part.filename ? `File: ${part.filename}` : "File attachment"];
                default:
                    return [];
            }
        })
        .join(" ");

    return normalizeWhitespace(text);
}

function createSnippet(haystack: string, query: string): string {
    const normalizedHaystack = normalizeWhitespace(haystack);

    if (!normalizedHaystack) {
        return "";
    }

    const normalizedQuery = normalizeWhitespace(query).toLowerCase();

    if (!normalizedQuery) {
        return truncateText(normalizedHaystack, SNIPPET_LENGTH);
    }

    const directIndex = normalizedHaystack.toLowerCase().indexOf(normalizedQuery);
    const tokenIndex =
        directIndex >= 0
            ? directIndex
            : tokenize(normalizedQuery)
                  .map((token) => normalizedHaystack.toLowerCase().indexOf(token))
                  .find((index) => index >= 0) ?? -1;

    if (tokenIndex < 0) {
        return truncateText(normalizedHaystack, SNIPPET_LENGTH);
    }

    const start = Math.max(0, tokenIndex - Math.floor((SNIPPET_LENGTH - normalizedQuery.length) / 2));
    const end = Math.min(normalizedHaystack.length, start + SNIPPET_LENGTH);
    const excerpt = normalizedHaystack.slice(start, end).trim();

    return `${start > 0 ? "..." : ""}${excerpt}${end < normalizedHaystack.length ? "..." : ""}`;
}

function buildSearchableText(candidate: SearchCandidate, includeAttachmentText: boolean): string {
    return normalizeWhitespace(
        [
            candidate.conversationTitle,
            candidate.messageText,
            candidate.model,
            candidate.provider,
            includeAttachmentText ? candidate.attachmentText : ""
        ]
            .filter(Boolean)
            .join(" ")
    );
}

function getMatchedFields(
    candidate: SearchCandidate,
    normalizedQuery: string,
    includeAttachmentText: boolean
): string[] {
    if (!normalizedQuery) {
        return [];
    }

    const fields: Array<[string, string]> = [
        ["title", candidate.conversationTitle],
        ["message", candidate.messageText],
        ["model", candidate.model ?? ""],
        ["provider", candidate.provider ?? ""]
    ];

    if (includeAttachmentText) {
        fields.push(["attachment", candidate.attachmentText]);
    }

    const tokens = tokenize(normalizedQuery);

    return fields
        .filter(([, value]) => {
            const haystack = value.toLowerCase();
            return (
                haystack.includes(normalizedQuery) ||
                tokens.some((token) => haystack.includes(token))
            );
        })
        .map(([name]) => name);
}

function matchesQuery(candidate: SearchCandidate, query: string, includeAttachmentText: boolean): boolean {
    const normalizedQuery = normalizeWhitespace(query).toLowerCase();

    if (!normalizedQuery) {
        return true;
    }

    const haystack = buildSearchableText(candidate, includeAttachmentText).toLowerCase();

    if (haystack.includes(normalizedQuery)) {
        return true;
    }

    return tokenize(normalizedQuery).some((token) => haystack.includes(token));
}

function scoreCandidate(candidate: SearchCandidate, query: string, includeAttachmentText: boolean): number {
    const normalizedQuery = normalizeWhitespace(query).toLowerCase();
    const haystack = buildSearchableText(candidate, includeAttachmentText).toLowerCase();
    let score = candidate.isFavorite ? 15 : 0;

    if (!normalizedQuery) {
        return score + candidate.message.createdAt.getTime() / 1_000_000_000_000;
    }

    if (haystack.includes(normalizedQuery)) {
        score += 100;
    }

    for (const token of tokenize(normalizedQuery)) {
        if (haystack.includes(token)) {
            score += 18;
        }
    }

    if (candidate.conversationTitle.toLowerCase().includes(normalizedQuery)) {
        score += 35;
    }

    if (candidate.messageText.toLowerCase().includes(normalizedQuery)) {
        score += 30;
    }

    if (includeAttachmentText && candidate.attachmentText.toLowerCase().includes(normalizedQuery)) {
        score += 20;
    }

    return score + candidate.message.createdAt.getTime() / 1_000_000_000_000;
}

export const conversationSearchService = {
    async searchForTool(
        userId: string,
        currentConversationId: string,
        filters: ConversationSearchFilters
    ) {
        const query = truncateText(filters.query?.trim() ?? "", MAX_QUERY_LENGTH);
        const dateFrom = parseOptionalDate(filters.dateFrom, "dateFrom");
        const dateTo = parseOptionalDate(filters.dateTo, "dateTo");

        if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
            throw new Error("dateFrom must be earlier than or equal to dateTo.");
        }

        const limit = Math.min(
            Math.max(filters.limit ?? DEFAULT_SEARCH_LIMIT, 1),
            MAX_SEARCH_LIMIT
        );
        const includeCurrentConversation = filters.includeCurrentConversation === true;
        const includeAttachmentText = filters.includeAttachmentText === true;
        const sort = filters.sort ?? "relevance";

        const conversations = await conversationsRepository.listConversationsByUserId(userId);
        const conversationMap = new Map(
            conversations.map((conversation) => [conversation.id, conversation])
        );
        const conversationIds = conversations
            .filter((conversation) => {
                if (!includeCurrentConversation && conversation.id === currentConversationId) {
                    return false;
                }

                if (filters.conversationId && conversation.id !== filters.conversationId) {
                    return false;
                }

                if (
                    typeof filters.isFavorite === "boolean" &&
                    conversation.isFavorite !== filters.isFavorite
                ) {
                    return false;
                }

                return true;
            })
            .map((conversation) => conversation.id);

        if (conversationIds.length === 0) {
            return {
                resultCount: 0,
                hasMore: false,
                appliedFilters: {
                    ...filters,
                    query,
                    includeCurrentConversation,
                    includeAttachmentText,
                    limit,
                    sort
                },
                results: []
            };
        }

        const [messages, attachments] = await Promise.all([
            conversationsRepository.listMessagesByConversationIds(conversationIds),
            conversationsRepository.listMessageAttachmentsByConversationIds(conversationIds)
        ]);
        const attachmentsByMessageId = new Map<string, MessageAttachmentRecord[]>();

        for (const attachment of attachments) {
            const current = attachmentsByMessageId.get(attachment.messageId) ?? [];
            current.push(attachment);
            attachmentsByMessageId.set(attachment.messageId, current);
        }

        const candidates = messages
            .map((message) => {
                const conversation = conversationMap.get(message.conversationId);

                if (!conversation) {
                    return null;
                }

                const metadata = message.metadata as Record<string, unknown> | null;
                const model =
                    typeof metadata?.model === "string" ? metadata.model : null;
                const provider =
                    typeof metadata?.provider === "string" ? metadata.provider : null;
                const deepResearch = metadata?.deepResearch === true;
                const messageAttachments =
                    attachmentsByMessageId.get(message.id) ?? [];

                return {
                    conversationId: conversation.id,
                    conversationTitle: conversation.title,
                    isFavorite: conversation.isFavorite,
                    message,
                    attachments: messageAttachments,
                    messageText: extractMessageText(message.parts as MessagePart[]),
                    attachmentText: normalizeWhitespace(
                        messageAttachments
                            .map((attachment) => attachment.extractedText ?? attachment.filename)
                            .filter(Boolean)
                            .join(" ")
                    ),
                    model,
                    provider,
                    deepResearch
                } satisfies SearchCandidate;
            })
            .filter((candidate): candidate is SearchCandidate => candidate !== null)
            .filter((candidate) => {
                if (filters.role && candidate.message.role !== filters.role) {
                    return false;
                }

                if (filters.status && candidate.message.status !== filters.status) {
                    return false;
                }

                if (
                    filters.model &&
                    (candidate.model ?? "").toLowerCase() !== filters.model.toLowerCase()
                ) {
                    return false;
                }

                if (
                    filters.provider &&
                    (candidate.provider ?? "").toLowerCase() !== filters.provider.toLowerCase()
                ) {
                    return false;
                }

                if (
                    typeof filters.deepResearch === "boolean" &&
                    candidate.deepResearch !== filters.deepResearch
                ) {
                    return false;
                }

                if (dateFrom && candidate.message.createdAt.getTime() < dateFrom.getTime()) {
                    return false;
                }

                if (dateTo && candidate.message.createdAt.getTime() > dateTo.getTime()) {
                    return false;
                }

                return matchesQuery(candidate, query, includeAttachmentText);
            });

        const sorted = [...candidates].sort((left, right) => {
            if (sort === "newest") {
                return right.message.createdAt.getTime() - left.message.createdAt.getTime();
            }

            if (sort === "oldest") {
                return left.message.createdAt.getTime() - right.message.createdAt.getTime();
            }

            const scoreDelta =
                scoreCandidate(right, query, includeAttachmentText) -
                scoreCandidate(left, query, includeAttachmentText);

            if (scoreDelta !== 0) {
                return scoreDelta;
            }

            return right.message.createdAt.getTime() - left.message.createdAt.getTime();
        });

        const results = sorted.slice(0, limit).map((candidate) => {
            const searchableText = buildSearchableText(candidate, includeAttachmentText);

            return {
                conversationId: candidate.conversationId,
                conversationTitle: candidate.conversationTitle,
                isFavorite: candidate.isFavorite,
                messageId: candidate.message.id,
                parentMessageId: candidate.message.parentMessageId ?? null,
                role: candidate.message.role,
                status: candidate.message.status,
                createdAt: candidate.message.createdAt.toISOString(),
                model: candidate.model,
                provider: candidate.provider,
                deepResearch: candidate.deepResearch,
                attachmentCount: candidate.attachments.length,
                matchedFields: getMatchedFields(
                    candidate,
                    query.toLowerCase(),
                    includeAttachmentText
                ),
                snippet: createSnippet(searchableText, query)
            };
        });

        return {
            resultCount: results.length,
            hasMore: sorted.length > limit,
            appliedFilters: {
                ...filters,
                query,
                includeCurrentConversation,
                includeAttachmentText,
                limit,
                sort,
                dateFrom: dateFrom?.toISOString() ?? null,
                dateTo: dateTo?.toISOString() ?? null
            },
            results
        };
    }
};
