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
import { todosRepository } from "../todos/todos.repository";
import {
    ConversationError,
    type MessagePart,
    type MessageRecord
} from "../conversations/conversations.types";
import { createTools } from "./ai.tools";
import {
    generationManager,
    type GenerationEntry,
    type SSEEvent
} from "./generation-manager";
import { logger } from "../../lib/logger";

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

            // Every tool-call in the assistant message must have a corresponding
            // tool-result, otherwise the AI SDK rejects the message history.
            // Synthesize an error result for any tool that never completed.
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
        "When tracking work with todo tools: keep exactly one in_progress item at a time, mark items completed immediately when done, and before your final response leave no stale in_progress items.",
        "Use these runtime facts as source of truth when answering time-sensitive questions:",
        `- Current datetime (ISO UTC): ${isoDateTime}`,
        `- Current datetime (UTC, human): ${utcDate}`,
        `- Server timezone: ${serverTimezone}`
    ].join("\n");
}

function hasMeaningfulAssistantOutput(parts: MessagePart[]): boolean {
    return parts.some(
        (part) =>
            (part.type === "text" || part.type === "reasoning") &&
            part.text.trim().length > 0
    );
}

async function reconcileLingeringInProgressTodos(conversationId: string) {
    const todos = await todosRepository.listByConversationId(conversationId);
    const inProgressTodos = todos.filter((todo) => todo.status === "in_progress");

    if (inProgressTodos.length === 0) {
        return;
    }

    for (const todo of inProgressTodos) {
        await todosRepository.updateStatus(conversationId, todo.id, "completed");
    }

    logger.info("Auto-completed lingering in_progress todos", {
        conversationId,
        updatedCount: inProgressTodos.length
    });
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

function buildErrorParts(
    generation: GenerationEntry,
    thinking: boolean
): MessagePart[] {
    const parts: MessagePart[] = [];

    if (thinking && generation.accumulatedReasoning) {
        parts.push({ type: "reasoning", text: generation.accumulatedReasoning });
    }

    for (const tp of generation.toolParts) {
        if (tp.type === "tool-invocation" && tp.state === "call") {
            parts.push({ ...tp, state: "error" });
        } else {
            parts.push(tp);
        }
    }

    if (generation.accumulatedText) {
        parts.push({ type: "text", text: generation.accumulatedText });
    }

    if (parts.length === 0) {
        parts.push({ type: "text", text: "" });
    }

    return parts;
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
    thinking: boolean,
    tools: ReturnType<typeof createTools>
) {
    const openrouter = createOpenRouter({ apiKey });
    const assistantMessageId = generation.messageId;

    logger.info("Generation started", {
        conversationId: generation.conversationId,
        messageId: assistantMessageId,
        modelId,
        thinking,
        messageCount: modelMessages.length
    });

    const result = streamText({
        model: openrouter(modelId),
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(20),
        abortSignal: generation.abortController.signal,
        onFinish: async ({ steps, finishReason }) => {
            if (generation.abortController.signal.aborted) return;
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

            // Resolve any tool calls that never received a result
            for (let i = 0; i < finalParts.length; i++) {
                const part = finalParts[i];
                if (part.type === "tool-invocation" && part.state === "call") {
                    finalParts[i] = { ...part, state: "error" };
                }
            }

            const generationCompletedAt = new Date().toISOString();
            const durationMs =
                new Date(generationCompletedAt).getTime() -
                new Date(generationStartedAt).getTime();
            const status = finishReason === "error" ? "failed" : "complete";

            logger.info("Generation finished", {
                conversationId: generation.conversationId,
                messageId: assistantMessageId,
                modelId,
                finishReason,
                status,
                steps: steps.length,
                durationMs
            });

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: finalParts,
                status,
                metadata: {
                    model: modelId,
                    thinkingEnabled: thinking,
                    generationStartedAt,
                    generationCompletedAt
                }
            });

            if (status === "complete" && hasMeaningfulAssistantOutput(finalParts)) {
                try {
                    await reconcileLingeringInProgressTodos(
                        generation.conversationId
                    );
                } catch (error) {
                    logger.warn("Todo reconciliation failed", {
                        conversationId: generation.conversationId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error)
                    });
                }
            }

            generationManager.complete(generation.conversationId);
        },
        onError: async (event: { error: unknown }) => {
            if (generation.abortController.signal.aborted) return;
            const generationCompletedAt = new Date().toISOString();
            const durationMs =
                new Date(generationCompletedAt).getTime() -
                new Date(generationStartedAt).getTime();
            const errorMessage =
                event.error instanceof Error
                    ? event.error.message
                    : String(event.error);

            logger.error("Generation failed (onError)", {
                conversationId: generation.conversationId,
                messageId: assistantMessageId,
                modelId,
                error: errorMessage,
                durationMs
            });

            const errorParts = buildErrorParts(generation, thinking);

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: errorParts,
                status: "failed",
                metadata: {
                    model: modelId,
                    thinkingEnabled: thinking,
                    generationStartedAt,
                    generationCompletedAt,
                    errorMessage
                }
            });

            generationManager.fail(generation.conversationId, errorMessage);
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
                    logger.debug("Tool call", {
                        conversationId: generation.conversationId,
                        toolName: event.toolName,
                        toolCallId: event.toolCallId,
                        args: event.args
                    });
                    upsertToolInvocationPart(generation.toolParts, {
                        type: "tool-invocation",
                        toolInvocationId: event.toolCallId as string,
                        toolName: event.toolName as string,
                        args: event.args as Record<string, unknown>,
                        state: "call"
                    });
                } else if (event.type === "tool-result") {
                    logger.debug("Tool result", {
                        conversationId: generation.conversationId,
                        toolName: event.toolName,
                        toolCallId: event.toolCallId
                    });
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

            // Do NOT emit "done" here — generationManager.complete() in onFinish
            // emits it after the DB save, eliminating the race condition.
        } catch (error) {
            const isAbort =
                (error instanceof Error && error.name === "AbortError") ||
                generation.abortController.signal.aborted;

            if (isAbort) {
                logger.info("Generation stopped by user", {
                    conversationId: generation.conversationId,
                    messageId: assistantMessageId
                });

                const stoppedParts: MessagePart[] = [];
                if (thinking && generation.accumulatedReasoning) {
                    stoppedParts.push({ type: "reasoning", text: generation.accumulatedReasoning });
                }
                for (const tp of generation.toolParts) {
                    stoppedParts.push(tp);
                }
                if (generation.accumulatedText) {
                    stoppedParts.push({ type: "text", text: generation.accumulatedText });
                }
                if (stoppedParts.length === 0) {
                    stoppedParts.push({ type: "text", text: "" });
                }

                await conversationsRepository.updateMessage(assistantMessageId, {
                    parts: stoppedParts,
                    status: "complete",
                    metadata: {
                        model: modelId,
                        thinkingEnabled: thinking,
                        generationStartedAt,
                        generationCompletedAt: new Date().toISOString()
                    }
                });

                generationManager.complete(generation.conversationId);
                return;
            }

            const streamErrorMessage =
                error instanceof Error ? error.message : "Stream failed";

            logger.error("Stream loop error", {
                conversationId: generation.conversationId,
                messageId: assistantMessageId,
                error: streamErrorMessage
            });

            const errorParts = buildErrorParts(generation, thinking);

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: errorParts,
                status: "failed",
                metadata: {
                    model: modelId,
                    thinkingEnabled: thinking,
                    generationStartedAt,
                    generationCompletedAt: new Date().toISOString(),
                    errorMessage: streamErrorMessage
                }
            });

            generationManager.fail(generation.conversationId, streamErrorMessage);
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
            logger.warn("Generation rejected: no API key", { conversationId, userId: user.id });
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

        const tools = createTools(conversationId, user.id);

        startBackgroundGeneration(
            generation,
            messagesWithSystemPrompt,
            modelId,
            apiKey,
            generationStartedAt,
            thinking,
            tools
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
