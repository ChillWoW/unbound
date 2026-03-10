import type {
    AssistantModelMessage,
    ModelMessage,
    ToolResultPart,
    UserModelMessage
} from "ai";
import type {
    MessagePart,
    MessageRecord
} from "../conversations/conversations.types";

function toToolResultOutput(result: unknown): ToolResultPart["output"] {
    if (typeof result === "string") {
        return { type: "text", value: result };
    }
    return {
        type: "json",
        value: (result ?? null) as import("ai").JSONValue
    };
}

export function toModelMessages(records: MessageRecord[]): ModelMessage[] {
    const result: ModelMessage[] = [];

    for (const record of records) {
        const role = record.role as string;
        const parts = record.parts as MessagePart[];

        if (role === "user") {
            const hasMediaParts = parts.some(
                (p) => p.type === "image" || p.type === "file"
            );

            if (!hasMediaParts) {
                const text = parts
                    .filter((p) => p.type === "text")
                    .map((p) => p.text)
                    .join("\n\n");

                if (text) {
                    result.push({ role: "user", content: text });
                }
            } else {
                const content: Extract<
                    UserModelMessage["content"],
                    Array<unknown>
                > = [];

                for (const p of parts) {
                    if (p.type === "text" && p.text) {
                        content.push({ type: "text", text: p.text });
                    } else if (p.type === "image") {
                        content.push({
                            type: "image",
                            image: p.data,
                            mediaType: p.mimeType
                        });
                    } else if (p.type === "file") {
                        content.push({
                            type: "file",
                            data: p.data,
                            mediaType: p.mimeType
                        });
                    }
                }

                if (content.length > 0) {
                    result.push({ role: "user", content });
                }
            }
        } else if (role === "assistant") {
            const textParts = parts.filter((p) => p.type === "text");
            const toolParts = parts.filter((p) => p.type === "tool-invocation");

            const content: Extract<
                AssistantModelMessage["content"],
                Array<unknown>
            > = [];

            for (const p of textParts) {
                if (p.text) content.push({ type: "text", text: p.text });
            }

            for (const p of toolParts) {
                content.push({
                    type: "tool-call",
                    toolCallId: p.toolInvocationId,
                    toolName: p.toolName,
                    input: p.args
                });
            }

            if (content.length > 0) {
                result.push({ role: "assistant", content });
            }

            if (toolParts.length > 0) {
                result.push({
                    role: "tool",
                    content: toolParts.map((p) => ({
                        type: "tool-result" as const,
                        toolCallId: p.toolInvocationId,
                        toolName: p.toolName,
                        output: toToolResultOutput(
                            p.state === "result" && p.result !== undefined
                                ? p.result
                                : { error: "Tool execution failed" }
                        )
                    }))
                });
            }
        } else if (role === "system") {
            const text = parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("\n\n");

            if (text) {
                result.push({ role: "system", content: text });
            }
        }
    }

    return result;
}

export function buildSystemPrompt(now = new Date()): string {
    const isoDateTime = now.toISOString();
    const utcDate = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        dateStyle: "full",
        timeStyle: "long"
    }).format(now);
    const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return [
        "You are Unbound, a capable and direct AI assistant.",
        "",
        "Guidelines:",
        "- Respond in Markdown when formatting improves clarity (lists, tables, headings, code blocks).",
        "- Be concise for simple questions; provide depth when the topic warrants it.",
        "- When asked to perform multi-step work, use the todo tools to track progress.",
        "- Keep exactly one task in_progress at a time and mark tasks completed immediately when done.",
        "- Before your final response, ensure no stale in_progress items remain.",
        "- If you are unsure about something, say so rather than guessing.",
        "- Use webSearch for information that is likely to be fresh or changing, especially news, releases, prices, rankings, schedules, social posts, and anything described as latest/current/recent.",
        "- Use scrape when the user provides or implies a specific URL/page that should be inspected.",
        "- Prefer searching when accuracy depends on up-to-date information; do not guess if current facts are uncertain.",
        "- After using webSearch or scrape, reference the relevant source URLs briefly in your answer.",
        "- Skip search for stable evergreen knowledge unless freshness is important.",
        "",
        "Runtime context (use as source of truth for time-sensitive questions):",
        `- Current datetime (ISO UTC): ${isoDateTime}`,
        `- Current datetime (UTC, human): ${utcDate}`,
        `- Server timezone: ${serverTimezone}`
    ].join("\n");
}
