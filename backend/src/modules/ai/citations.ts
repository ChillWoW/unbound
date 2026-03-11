import type { MessagePart } from "../conversations/conversations.types";

export interface CitationSource {
    id: string;
    title: string;
    url: string;
    host: string;
    snippet?: string;
    sourceType: "web" | "document";
}

function normalizeUrl(value: unknown): string | null {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    try {
        const url = new URL(value.trim());

        if (!["http:", "https:"].includes(url.protocol)) {
            return null;
        }

        return url.toString();
    } catch {
        return null;
    }
}

function getHost(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

export function extractSourcesFromToolResult(
    toolName: string,
    result: unknown
): CitationSource[] {
    if (!result || typeof result !== "object") {
        return [];
    }

    const record = result as Record<string, unknown>;

    if (toolName === "webSearch") {
        const results = Array.isArray(record.results)
            ? (record.results as Array<Record<string, unknown>>)
            : [];

        return results.flatMap((entry, index) => {
            const url = normalizeUrl(entry.url);

            if (!url) {
                return [];
            }

            const title =
                typeof entry.title === "string" && entry.title.trim()
                    ? entry.title.trim()
                    : `Source ${index + 1}`;
            const snippet =
                typeof entry.content === "string" && entry.content.trim()
                    ? entry.content.trim()
                    : undefined;

            return [
                {
                    id: `${toolName}-${index}-${url}`,
                    title,
                    url,
                    host: getHost(url),
                    snippet,
                    sourceType: "web" as const
                }
            ];
        });
    }

    if (toolName === "scrape") {
        const url = normalizeUrl(record.url ?? record.proxyUrl);

        if (!url) {
            return [];
        }

        const snippet =
            typeof record.content === "string" && record.content.trim()
                ? record.content.trim().slice(0, 280)
                : undefined;

        return [
            {
                id: `${toolName}-${url}`,
                title: getHost(url),
                url,
                host: getHost(url),
                snippet,
                sourceType: "web"
            }
        ];
    }

    return [];
}

export function extractSourcesFromParts(parts: MessagePart[]): CitationSource[] {
    const deduped = new Map<string, CitationSource>();

    for (const part of parts) {
        if (part.type !== "tool-invocation" || part.state !== "result") {
            continue;
        }

        for (const source of extractSourcesFromToolResult(part.toolName, part.result)) {
            deduped.set(source.id, source);
        }
    }

    return [...deduped.values()];
}
