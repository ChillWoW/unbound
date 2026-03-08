import { randomBytes } from "node:crypto";
import {
    streamText,
    stepCountIs,
    type AssistantModelMessage,
    type JSONValue,
    type ModelMessage,
    type ToolResultPart,
    type UserModelMessage
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { requireAuth } from "../../middleware/require-auth";
import { settingsService } from "../settings/settings.service";
import { conversationsRepository } from "../conversations/conversations.repository";
import {
    ConversationError,
    type MessagePart,
    type MessageRecord
} from "../conversations/conversations.types";
import { tools } from "./ai.tools";
import {
    generationManager,
    type GenerationEntry,
    type SSEEvent
} from "./generation-manager";

function createMessageId(): string {
    return `msg_${randomBytes(10).toString("hex")}`;
}

function toToolResultOutput(result: unknown): ToolResultPart["output"] {
    if (typeof result === "string") {
        return {
            type: "text",
            value: result
        };
    }

    return {
        type: "json",
        value: (result ?? null) as JSONValue
    };
}

function toModelMessages(records: MessageRecord[]): ModelMessage[] {
    const result: ModelMessage[] = [];

    for (const record of records) {
        const role = record.role as string;
        const parts = record.parts as MessagePart[];

        if (role === "user") {
            const imageParts = parts.filter((p) => p.type === "image");

            if (imageParts.length === 0) {
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

            const toolResults = toolParts.filter(
                (p) => p.state === "result" && p.result !== undefined
            );

            if (toolResults.length > 0) {
                result.push({
                    role: "tool",
                    content: toolResults.map((p) => ({
                        type: "tool-result" as const,
                        toolCallId: p.toolInvocationId,
                        toolName: p.toolName,
                        output: toToolResultOutput(p.result)
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

function buildSystemPrompt(now = new Date()): string {
    const isoDateTime = now.toISOString();
    const utcDate = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        dateStyle: "full",
        timeStyle: "long"
    }).format(now);
    const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return [
        "You are a helpful assistant named Unbound for this app.",
        "You have access to multiple tools to help you answer questions and complete tasks.",
        "Use these runtime facts as source of truth when answering time-sensitive questions:",
        `- Current datetime (ISO UTC): ${isoDateTime}`,
        `- Current datetime (UTC, human): ${utcDate}`,
        `- Server timezone: ${serverTimezone}`
    ].join("\n");
}

function encodeSSE(event: SSEEvent): Uint8Array {
    return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

type ToolInvocationMessagePart = Extract<
    MessagePart,
    { type: "tool-invocation" }
>;

function upsertToolInvocationPart(
    parts: MessagePart[],
    incoming: ToolInvocationMessagePart
) {
    const idx = parts.findIndex(
        (p) =>
            p.type === "tool-invocation" &&
            p.toolInvocationId === incoming.toolInvocationId
    );

    if (idx === -1) {
        parts.push(incoming);
        return;
    }

    const existing = parts[idx] as ToolInvocationMessagePart;

    if (
        incoming.state === "call" &&
        (existing.state === "result" || existing.state === "error")
    ) {
        parts[idx] = {
            ...existing,
            toolName: incoming.toolName,
            args: incoming.args
        };
        return;
    }

    parts[idx] = {
        ...existing,
        ...incoming,
        result: incoming.state === "result" ? incoming.result : undefined
    };
}

function applyToolResult(
    parts: MessagePart[],
    input: {
        toolCallId: string;
        toolName: string;
        output: unknown;
    }
) {
    upsertToolInvocationPart(parts, {
        type: "tool-invocation",
        toolInvocationId: input.toolCallId,
        toolName: input.toolName,
        args: {},
        state: "result",
        result: input.output
    });
}

function createSubscriberStream(
    generation: GenerationEntry,
    isReconnect: boolean
): Response {
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(
                encodeSSE({
                    type: "message-start",
                    messageId: generation.messageId
                })
            );

            if (
                isReconnect &&
                (generation.accumulatedText ||
                    generation.accumulatedReasoning ||
                    generation.toolParts.length > 0)
            ) {
                controller.enqueue(
                    encodeSSE({
                        type: "reconnect-state",
                        text: generation.accumulatedText,
                        reasoning: generation.accumulatedReasoning,
                        toolParts: generation.toolParts
                    })
                );
            }

            if (generation.finished) {
                controller.enqueue(encodeSSE({ type: "done" }));
                controller.close();
                return;
            }

            let closed = false;

            const onEvent = (event: SSEEvent) => {
                if (closed) return;
                try {
                    controller.enqueue(encodeSSE(event));
                    if (event.type === "done") {
                        closed = true;
                        controller.close();
                    }
                } catch {
                    closed = true;
                    generation.emitter.off("event", onEvent);
                }
            };

            generation.emitter.on("event", onEvent);
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Message-Id": generation.messageId
        }
    });
}

function startBackgroundGeneration(
    generation: GenerationEntry,
    modelMessages: ModelMessage[],
    modelId: string,
    apiKey: string,
    generationStartedAt: string,
    thinking: boolean
) {
    const openrouter = createOpenRouter({ apiKey });
    const assistantMessageId = generation.messageId;

    const result = streamText({
        model: openrouter(modelId),
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(5),
        onFinish: async ({ steps, finishReason }) => {
            const finalParts: MessagePart[] = [];

            for (const step of steps) {
                const stepReasoning = (step as Record<string, unknown>)
                    .reasoningText as string | undefined;
                const stepText = step.text;
                const stepToolCalls = step.toolCalls ?? [];
                const stepToolResults = step.toolResults ?? [];

                if (thinking && stepReasoning) {
                    finalParts.push({ type: "reasoning", text: stepReasoning });
                }

                for (const call of stepToolCalls) {
                    upsertToolInvocationPart(finalParts, {
                        type: "tool-invocation",
                        toolInvocationId: call.toolCallId,
                        toolName: call.toolName,
                        args: (call as unknown as Record<string, unknown>)
                            .input as Record<string, unknown>,
                        state: "call"
                    });
                }

                for (const toolResult of stepToolResults) {
                    applyToolResult(finalParts, {
                        toolCallId: toolResult.toolCallId,
                        toolName: toolResult.toolName,
                        output: (
                            toolResult as unknown as Record<string, unknown>
                        ).output
                    });
                }

                if (stepText) {
                    finalParts.push({ type: "text", text: stepText });
                }
            }

            if (finalParts.length === 0) {
                finalParts.push({ type: "text", text: "" });
            }

            const generationCompletedAt = new Date().toISOString();

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: finalParts,
                status: finishReason === "error" ? "failed" : "complete",
                metadata: {
                    model: modelId,
                    thinkingEnabled: thinking,
                    generationStartedAt,
                    generationCompletedAt
                }
            });

            generationManager.complete(generation.conversationId);
        },
        onError: async () => {
            await conversationsRepository.updateMessage(assistantMessageId, {
                status: "failed",
                metadata: {
                    model: modelId,
                    thinkingEnabled: thinking,
                    generationStartedAt,
                    generationCompletedAt: new Date().toISOString()
                }
            });

            generationManager.fail(generation.conversationId);
        }
    });

    (async () => {
        try {
            for await (const chunk of result.fullStream) {
                const event = mapChunkToEvent(chunk);
                if (!event) continue;

                if (event.type === "text-delta") {
                    generation.accumulatedText += event.text as string;
                } else if (event.type === "reasoning" && thinking) {
                    generation.accumulatedReasoning += event.text as string;
                } else if (event.type === "tool-call") {
                    upsertToolInvocationPart(generation.toolParts, {
                        type: "tool-invocation",
                        toolInvocationId: event.toolCallId as string,
                        toolName: event.toolName as string,
                        args: event.args as Record<string, unknown>,
                        state: "call"
                    });
                } else if (event.type === "tool-result") {
                    applyToolResult(generation.toolParts, {
                        toolCallId: event.toolCallId as string,
                        toolName: event.toolName as string,
                        output: event.result
                    });
                }

                if (event.type !== "reasoning" || thinking) {
                    generation.emitter.emit("event", event);
                }
            }

            generation.emitter.emit("event", { type: "done" });
        } catch (error) {
            generation.emitter.emit("event", {
                type: "error",
                error: error instanceof Error ? error.message : "Stream failed"
            });
            generation.emitter.emit("event", { type: "done" });
        }
    })();
}

function mapChunkToEvent(chunk: unknown): SSEEvent | null {
    const c = chunk as Record<string, unknown>;

    const reasoningText =
        (typeof c.text === "string" && c.text) ||
        (typeof c.textDelta === "string" && c.textDelta) ||
        (typeof c.delta === "string" && c.delta) ||
        (typeof c.reasoning === "string" && c.reasoning) ||
        (typeof c.reasoningText === "string" && c.reasoningText) ||
        (typeof c.reasoningDelta === "string" && c.reasoningDelta) ||
        null;

    switch (c.type) {
        case "text-delta":
            return { type: "text-delta", text: c.text as string };

        case "tool-call":
            return {
                type: "tool-call",
                toolCallId: c.toolCallId as string,
                toolName: c.toolName as string,
                args: c.input as Record<string, unknown>
            };

        case "tool-result":
            return {
                type: "tool-result",
                toolCallId: c.toolCallId as string,
                toolName: c.toolName as string,
                result: c.output
            };

        case "reasoning":
        case "reasoning-delta":
            return reasoningText
                ? { type: "reasoning", text: reasoningText }
                : null;

        case "error":
            return { type: "error", error: String(c.error) };

        case "finish":
            return { type: "finish", finishReason: c.finishReason as string };

        default:
            return null;
    }
}

export const aiService = {
    async generateResponse(
        request: Request,
        conversationId: string,
        modelId: string,
        thinking = false
    ): Promise<Response> {
        const user = await requireAuth(request);

        if (generationManager.isActive(conversationId)) {
            throw new ConversationError(
                409,
                "A generation is already in progress for this conversation."
            );
        }

        const apiKey =
            await settingsService.getDecryptedOpenRouterApiKeyForUser(user.id);

        if (!apiKey) {
            throw new ConversationError(
                400,
                "Add your OpenRouter API key in settings to use AI features."
            );
        }

        const conversation =
            await conversationsRepository.findConversationByIdForUser(
                user.id,
                conversationId
            );

        if (!conversation) {
            throw new ConversationError(404, "Conversation not found.");
        }

        const messageRecords =
            await conversationsRepository.listMessagesByConversationId(
                conversationId
            );

        const modelMessages = toModelMessages(messageRecords);
        const messagesWithSystemPrompt: ModelMessage[] = [
            { role: "system", content: buildSystemPrompt() },
            ...modelMessages
        ];
        const assistantMessageId = createMessageId();
        const generationStartedAt = new Date().toISOString();

        await conversationsRepository.appendMessageToConversation({
            conversationId,
            messageId: assistantMessageId,
            messageRole: "assistant",
            messageParts: [],
            messageStatus: "pending",
            messageMetadata: {
                model: modelId,
                thinkingEnabled: thinking,
                generationStartedAt
            }
        });

        const generation = generationManager.register(
            conversationId,
            user.id,
            assistantMessageId
        );

        startBackgroundGeneration(
            generation,
            messagesWithSystemPrompt,
            modelId,
            apiKey,
            generationStartedAt,
            thinking
        );

        return createSubscriberStream(generation, false);
    },

    async subscribeToGeneration(
        request: Request,
        conversationId: string
    ): Promise<Response> {
        const user = await requireAuth(request);

        const conversation =
            await conversationsRepository.findConversationByIdForUser(
                user.id,
                conversationId
            );

        if (!conversation) {
            throw new ConversationError(404, "Conversation not found.");
        }

        const generation = generationManager.get(conversationId);

        if (!generation || generation.userId !== user.id) {
            return Response.json({ generating: false });
        }

        return createSubscriberStream(generation, true);
    }
};
