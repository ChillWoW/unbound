import type {
    AssistantModelMessage,
    ModelMessage,
    ToolResultPart,
    UserModelMessage
} from "ai";
import { blobStorage } from "../attachments/blob-storage";
import type { ModelAttachmentCapabilities } from "./model-attachment-capabilities";
import type {
    MessageAttachmentRecord,
    MessagePart,
    MessageRecord
} from "../conversations/conversations.types";

const MAX_EXTRACTED_TEXT_LENGTH = 12_000;

function describeAttachment(
    part: Extract<MessagePart, { type: "image" | "file" }>
) {
    const details = [
        part.filename,
        part.mimeType,
        part.size ? `${part.size} bytes` : null
    ]
        .filter(Boolean)
        .join(", ");

    return details || part.mimeType;
}

function createFileContextText(
    part: Extract<MessagePart, { type: "file" }>,
    attachment: MessageAttachmentRecord | undefined,
    nativeFileDelivery: boolean
) {
    const description = describeAttachment(part);
    const extractedText = attachment?.extractedText?.trim();

    if (!extractedText) {
        return nativeFileDelivery
            ? `Attached file: ${description}.`
            : [
                  `Attached file: ${description}.`,
                  "No extractable text was available from this file, so only metadata is provided."
              ].join("\n\n");
    }

    const intro = nativeFileDelivery
        ? "Use the extracted document text below if native file parsing is unavailable:"
        : "The file has been converted into text context below:";

    return [
        `Attached file: ${description}.`,
        intro,
        extractedText.slice(0, MAX_EXTRACTED_TEXT_LENGTH)
    ].join("\n\n");
}

function toToolResultOutput(result: unknown): ToolResultPart["output"] {
    if (typeof result === "string") {
        return { type: "text", value: result };
    }
    return {
        type: "json",
        value: (result ?? null) as import("ai").JSONValue
    };
}

export async function toModelMessages(
    records: MessageRecord[],
    attachments: MessageAttachmentRecord[],
    capabilities?: Pick<ModelAttachmentCapabilities, "supportsNativeFileInput">
): Promise<ModelMessage[]> {
    const result: ModelMessage[] = [];
    const attachmentsById = new Map(
        attachments.map((attachment) => [attachment.id, attachment])
    );
    const base64Cache = new Map<string, string>();
    const supportsNativeFileInput = capabilities?.supportsNativeFileInput ?? false;

    async function getAttachmentBase64(attachmentId: string): Promise<string | null> {
        const attachment = attachmentsById.get(attachmentId);

        if (!attachment) {
            return null;
        }

        const cached = base64Cache.get(attachmentId);
        if (cached) {
            return cached;
        }

        const data = await blobStorage.readBase64(attachment.storageKey);
        base64Cache.set(attachmentId, data);
        return data;
    }

    for (const record of records) {
        const role = record.role as string;
        const parts = record.parts as MessagePart[];

        if (role === "user") {
            const hasMediaParts = parts.some(
                (part) => part.type === "image" || part.type === "file"
            );

            if (!hasMediaParts) {
                const text = parts
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("\n\n");

                if (text) {
                    result.push({ role: "user", content: text });
                }
                continue;
            }

            const content: Extract<
                UserModelMessage["content"],
                Array<unknown>
            > = [];

            for (const part of parts) {
                if (part.type === "text" && part.text) {
                    content.push({ type: "text", text: part.text });
                    continue;
                }

                if (part.type === "image") {
                    const imageData = await getAttachmentBase64(part.attachmentId);
                    content.push({
                        type: "text",
                        text: `Attached image: ${describeAttachment(part)}.`
                    });

                    if (imageData) {
                        content.push({
                            type: "image",
                            image: imageData,
                            mediaType: part.mimeType
                        });
                    }

                    continue;
                }

                if (part.type === "file") {
                    const attachment = attachmentsById.get(part.attachmentId);
                    const fileData = supportsNativeFileInput
                        ? await getAttachmentBase64(part.attachmentId)
                        : null;

                    content.push({
                        type: "text",
                        text: createFileContextText(
                            part,
                            attachment,
                            supportsNativeFileInput
                        )
                    });

                    if (supportsNativeFileInput && fileData) {
                        content.push({
                            type: "file",
                            data: fileData,
                            mediaType: part.mimeType
                        });
                    }
                }
            }

            if (content.length > 0) {
                result.push({ role: "user", content });
            }
            continue;
        }

        if (role === "assistant") {
            const textParts = parts.filter((part) => part.type === "text");
            const toolParts = parts.filter((part) => part.type === "tool-invocation");

            const content: Extract<
                AssistantModelMessage["content"],
                Array<unknown>
            > = [];

            for (const part of textParts) {
                if (part.text) content.push({ type: "text", text: part.text });
            }

            for (const part of toolParts) {
                content.push({
                    type: "tool-call",
                    toolCallId: part.toolInvocationId,
                    toolName: part.toolName,
                    input: part.args
                });
            }

            if (content.length > 0) {
                result.push({ role: "assistant", content });
            }

            if (toolParts.length > 0) {
                result.push({
                    role: "tool",
                    content: toolParts.map((part) => ({
                        type: "tool-result" as const,
                        toolCallId: part.toolInvocationId,
                        toolName: part.toolName,
                        output: toToolResultOutput(
                            part.state === "result" && part.result !== undefined
                                ? part.result
                                : { error: "Tool execution failed" }
                        )
                    }))
                });
            }
            continue;
        }

        if (role === "system") {
            const text = parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
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
        "- Respond in Markdown when formatting improves clarity (lists, tables, headings, code blocks). Use mermaid code blocks for diagrams and flowcharts.",
        "- Be concise for simple questions; provide depth when the topic warrants it.",
        "- When asked to perform multi-step work, use the todo tools to track progress.",
        "- Keep exactly one task in_progress at a time and mark tasks completed immediately when done.",
        "- Before your final response, ensure no stale in_progress items remain.",
        "- If you are unsure about something, say so rather than guessing.",
        "- Use webSearch for information that is likely to be fresh or changing, especially news, releases, prices, rankings, schedules, social posts, and anything described as latest/current/recent.",
        "- Use scrape when the user provides or implies a specific URL/page that should be inspected.",
        "- Use pythonSandbox when exact computation, data analysis, or code validation will be more reliable than mental math. Keep snippets short and print concise outputs.",
        "- Use pythonSandboxInstallPackage only when a dependency is missing and one of the allowlisted packages is truly needed.",
        "- Use pythonSandboxReset when the Python session needs a clean slate or appears corrupted.",
        "- Prefer searching when accuracy depends on up-to-date information; do not guess if current facts are uncertain.",
        "- Skip search for stable evergreen knowledge unless freshness is important.",
        "",
        "Runtime context (use as source of truth for time-sensitive questions):",
        `- Current datetime (ISO UTC): ${isoDateTime}`,
        `- Current datetime (UTC, human): ${utcDate}`,
        `- Server timezone: ${serverTimezone}`
    ].join("\n");
}
