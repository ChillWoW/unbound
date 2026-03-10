import { tool } from "ai";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { todosRepository } from "../todos/todos.repository";

const SEARCH_RESULT_LIMIT = 5;
const SEARCH_SNIPPET_MAX_LENGTH = 280;
const SCRAPE_CONTENT_MAX_LENGTH = 6000;
const FETCH_TIMEOUT_MS = 10_000;

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
    const normalized = normalizeWhitespace(value);

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeTargetUrl(value: string): string {
    const trimmed = value.trim();
    const withProtocol = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

    let parsed: URL;

    try {
        parsed = new URL(withProtocol);
    } catch {
        throw new Error("Please provide a valid URL.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only http and https URLs are supported.");
    }

    return parsed.toString();
}

async function fetchJson(url: URL): Promise<unknown> {
    let response: Response;

    try {
        response = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
    } catch (error) {
        logger.warn("webSearch request failed", {
            url: url.toString(),
            error: error instanceof Error ? error.message : String(error)
        });
        throw new Error("Unable to reach the search service right now.");
    }

    if (!response.ok) {
        let bodyPreview = "";

        try {
            bodyPreview = truncateText(await response.text(), 400);
        } catch {
            bodyPreview = "[unreadable body]";
        }

        logger.warn("webSearch response not ok", {
            url: url.toString(),
            status: response.status,
            statusText: response.statusText,
            bodyPreview
        });
        throw new Error("Search service returned an error.");
    }

    try {
        return await response.json();
    } catch (error) {
        logger.warn("webSearch JSON parsing failed", {
            url: url.toString(),
            error: error instanceof Error ? error.message : String(error)
        });
        throw new Error("Search service returned unreadable JSON.");
    }
}

async function fetchText(url: string): Promise<string> {
    let response: Response;

    try {
        response = await fetch(url, {
            headers: { Accept: "text/plain, text/markdown;q=0.9, */*;q=0.1" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
    } catch (error) {
        logger.warn("scrape request failed", {
            url,
            error: error instanceof Error ? error.message : String(error)
        });
        throw new Error("Unable to reach the scrape service right now.");
    }

    if (!response.ok) {
        let bodyPreview = "";

        try {
            bodyPreview = truncateText(await response.text(), 400);
        } catch {
            bodyPreview = "[unreadable body]";
        }

        logger.warn("scrape response not ok", {
            url,
            status: response.status,
            statusText: response.statusText,
            bodyPreview
        });
        throw new Error("Scrape service returned an error.");
    }

    try {
        return await response.text();
    } catch (error) {
        logger.warn("scrape text parsing failed", {
            url,
            error: error instanceof Error ? error.message : String(error)
        });
        throw new Error("Scrape service returned unreadable text.");
    }
}

function normalizeSearchResults(payload: unknown, limit: number) {
    const results =
        payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).results)
            ? ((payload as Record<string, unknown>).results as Array<Record<string, unknown>>)
            : [];

    return results.slice(0, limit).map((item, index) => {
        const engines = Array.isArray(item.engines)
            ? (item.engines as unknown[])
            : [];

        return {
            position: index + 1,
            title: truncateText(
                String(item.title ?? item.url ?? "Untitled result"),
                140
            ),
            url: String(item.url ?? ""),
            snippet: truncateText(
                String(item.content ?? item.snippet ?? item.description ?? ""),
                SEARCH_SNIPPET_MAX_LENGTH
            ),
            engine:
                typeof item.engine === "string"
                    ? item.engine
                    : typeof engines[0] === "string"
                      ? String(engines[0])
                      : null
        };
    });
}

function normalizeScrapeContent(payload: string) {
    const text = payload.trim();
    const content = truncateText(text, SCRAPE_CONTENT_MAX_LENGTH);

    return {
        content,
        truncated: text.length > content.length,
        contentLength: content.length
    };
}

function formatTodos(
    todos: Awaited<ReturnType<typeof todosRepository.listByConversationId>>
) {
    return todos.map((t) => ({
        id: t.id,
        content: t.content,
        status: t.status,
        priority: t.priority,
        position: t.position,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString()
    }));
}

export function createTools(conversationId: string, userId: string) {
    return {
        webSearch: tool({
            description:
                "Search the web for up-to-date information. Returns a small set of normalized results with titles, URLs, and short snippets.",
            inputSchema: z.object({
                query: z.string().min(1).describe("Search query"),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(SEARCH_RESULT_LIMIT)
                    .optional()
                    .describe(`Maximum results to return, up to ${SEARCH_RESULT_LIMIT}`),
                category: z
                    .string()
                    .optional()
                    .describe("Optional SearXNG category, e.g. general, news, science"),
                language: z
                    .string()
                    .optional()
                    .describe("Optional result language, e.g. en-US")
            }),
            execute: async ({ query, limit, category, language }) => {
                try {
                    const normalizedQuery = query.trim();

                    if (!env.searxngBaseUrl) {
                        throw new Error("Web search is not configured.");
                    }

                    logger.info("webSearch tool started", {
                        conversationId,
                        userId,
                        query: normalizedQuery,
                        category: category?.trim() || null,
                        language: language?.trim() || null,
                        limit: limit ?? SEARCH_RESULT_LIMIT,
                        baseUrl: env.searxngBaseUrl
                    });

                    let searchUrl: URL;

                    try {
                        searchUrl = new URL("/search", env.searxngBaseUrl);
                    } catch {
                        throw new Error("SEARXNG_BASE_URL is invalid.");
                    }

                    searchUrl.searchParams.set("q", normalizedQuery);
                    searchUrl.searchParams.set("format", "json");
                    if (category?.trim()) {
                        searchUrl.searchParams.set("categories", category.trim());
                    }
                    if (language?.trim()) {
                        searchUrl.searchParams.set("language", language.trim());
                    }

                    const payload = await fetchJson(searchUrl);
                    const results = normalizeSearchResults(
                        payload,
                        limit ?? SEARCH_RESULT_LIMIT
                    );

                    logger.info("webSearch tool completed", {
                        conversationId,
                        userId,
                        query: normalizedQuery,
                        resultCount: results.length,
                        url: searchUrl.toString()
                    });

                    return {
                        query: normalizedQuery,
                        url: searchUrl.toString(),
                        resultCount: results.length,
                        results
                    };
                } catch (error) {
                    logger.error("webSearch tool failed", {
                        conversationId,
                        userId,
                        query: query.trim(),
                        error: error instanceof Error ? error.message : String(error)
                    });
                    throw error;
                }
            }
        }),

        scrape: tool({
            description:
                "Fetch and extract readable page content from a URL. Returns a trimmed text excerpt to avoid overfilling context.",
            inputSchema: z.object({
                url: z.string().min(1).describe("The URL to scrape")
            }),
            execute: async ({ url }) => {
                try {
                    logger.info("scrape tool started", {
                        conversationId,
                        userId,
                        url: url.trim()
                    });

                    const normalizedUrl = normalizeTargetUrl(url);
                    const proxyUrl = `https://r.jina.ai/${normalizedUrl}`;
                    const payload = await fetchText(proxyUrl);
                    const normalized = normalizeScrapeContent(payload);

                    logger.info("scrape tool completed", {
                        conversationId,
                        userId,
                        url: normalizedUrl,
                        proxyUrl,
                        contentLength: normalized.contentLength,
                        truncated: normalized.truncated
                    });

                    return {
                        url: normalizedUrl,
                        proxyUrl,
                        ...normalized
                    };
                } catch (error) {
                    logger.error("scrape tool failed", {
                        conversationId,
                        userId,
                        url: url.trim(),
                        error: error instanceof Error ? error.message : String(error)
                    });
                    throw error;
                }
            }
        }),

        todoWrite: tool({
            description:
                "Create or update todos for the current conversation. Use merge=true to update existing todos by id and add new ones. Use merge=false to replace the entire list. Keep exactly one task in_progress, and mark tasks completed as soon as they are done.",
            inputSchema: z.object({
                todos: z
                    .array(
                        z.object({
                            id: z
                                .string()
                                .describe(
                                    "Unique identifier for the todo (short slug, e.g. 'setup-db')"
                                ),
                            content: z
                                .string()
                                .describe("Description of the todo item"),
                            status: z.enum([
                                "pending",
                                "in_progress",
                                "completed",
                                "cancelled"
                            ]),
                            priority: z
                                .enum(["low", "medium", "high"])
                                .optional()
                                .describe("Defaults to medium if not provided")
                        })
                    )
                    .min(1),
                merge: z
                    .boolean()
                    .describe(
                        "true = upsert by id, keeping unmentioned todos. false = replace entire list."
                    )
            }),
            execute: async ({ todos, merge }) => {
                const updated = await todosRepository.upsertTodos(
                    conversationId,
                    userId,
                    todos,
                    merge
                );
                return { todos: formatTodos(updated) };
            }
        }),

        todoRead: tool({
            description:
                "Read the current todo list for this conversation. Returns all todos ordered by position.",
            inputSchema: z.object({}),
            execute: async () => {
                const todos =
                    await todosRepository.listByConversationId(conversationId);
                return { todos: formatTodos(todos) };
            }
        }),

        todoSetStatus: tool({
            description:
                "Update the status of one or more todo items. Pass multiple updates to tick several todos in a single call. Before finalizing your response, avoid leaving stale in_progress tasks.",
            inputSchema: z.object({
                updates: z
                    .array(
                        z.object({
                            todoId: z
                                .string()
                                .describe("The id of the todo to update"),
                            status: z.enum([
                                "pending",
                                "in_progress",
                                "completed",
                                "cancelled"
                            ])
                        })
                    )
                    .min(1)
                    .describe("One or more status updates to apply atomically")
            }),
            execute: async ({ updates }) => {
                await todosRepository.updateStatusBatch(
                    conversationId,
                    updates
                );
                const todos =
                    await todosRepository.listByConversationId(conversationId);
                return { todos: formatTodos(todos) };
            }
        }),

        todoDelete: tool({
            description:
                "Delete specific todos by their ids. Returns the remaining todos.",
            inputSchema: z.object({
                todoIds: z
                    .array(z.string())
                    .min(1)
                    .describe("Array of todo ids to delete")
            }),
            execute: async ({ todoIds }) => {
                await todosRepository.deleteTodos(conversationId, todoIds);
                const todos =
                    await todosRepository.listByConversationId(conversationId);
                return { todos: formatTodos(todos) };
            }
        })
    };
}
