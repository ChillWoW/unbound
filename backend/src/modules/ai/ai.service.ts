import { randomBytes } from "node:crypto";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { requireAuth } from "../../middleware/require-auth";
import { createModelInstance } from "./provider-factory";
import {
    isValidProvider,
    type ProviderType
} from "../../lib/provider-registry";
import { settingsService } from "../settings/settings.service";
import { conversationsRepository } from "../conversations/conversations.repository";
import { todosRepository } from "../todos/todos.repository";
import {
    ConversationError,
    type MessagePart
} from "../conversations/conversations.types";
import { createTools } from "./ai.tools";
import {
    generationManager,
    type GenerationEntry,
    type SSEEvent
} from "./generation-manager";
import { buildOptimizedContext } from "./context-manager";
import { modelsService } from "../models/models.service";
import { logger } from "../../lib/logger";

import { toModelMessages, buildSystemPrompt } from "./message-converter";
import { buildProviderOptions } from "./provider-options";
import {
    upsertToolInvocationPart,
    applyToolResult,
    buildAccumulatedParts
} from "./message-parts";
import { encodeSSE, mapChunkToEvent, createSubscriberStream } from "./sse";

function createMessageId(): string {
    return `msg_${randomBytes(10).toString("hex")}`;
}

function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
        const obj = error as Record<string, unknown>;
        if (typeof obj.message === "string") return obj.message;
        if (typeof obj.error === "string") return obj.error;
        if (
            obj.error &&
            typeof obj.error === "object" &&
            typeof (obj.error as Record<string, unknown>).message === "string"
        ) {
            return (obj.error as Record<string, unknown>).message as string;
        }
        try {
            return JSON.stringify(error);
        } catch {
            return "[Unreadable error object]";
        }
    }
    return String(error);
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
    const inProgressTodos = todos.filter(
        (todo) => todo.status === "in_progress"
    );

    if (inProgressTodos.length === 0) return;

    for (const todo of inProgressTodos) {
        await todosRepository.updateStatus(
            conversationId,
            todo.id,
            "completed"
        );
    }

    logger.info("Auto-completed lingering in_progress todos", {
        conversationId,
        updatedCount: inProgressTodos.length
    });
}

function aggregateUsage(
    steps: Array<Record<string, unknown>>
): { promptTokens: number; completionTokens: number; totalTokens: number } {
    let promptTokens = 0;
    let completionTokens = 0;

    for (const step of steps) {
        const usage = step.usage as
            | Record<string, unknown>
            | undefined;
        if (!usage) continue;
        promptTokens += (typeof usage.promptTokens === "number" ? usage.promptTokens : 0);
        completionTokens += (typeof usage.completionTokens === "number" ? usage.completionTokens : 0);
    }

    return {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
    };
}

const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

function startBackgroundGeneration(
    generation: GenerationEntry,
    modelMessages: ModelMessage[],
    modelId: string,
    provider: ProviderType,
    apiKey: string,
    generationStartedAt: string,
    thinking: boolean,
    tools: ReturnType<typeof createTools>,
    maxOutputTokens: number | null
) {
    const model = createModelInstance(provider, modelId, apiKey);
    const assistantMessageId = generation.messageId;
    const providerOptions = buildProviderOptions(provider, modelId, thinking);

    logger.info("Generation started", {
        conversationId: generation.conversationId,
        messageId: assistantMessageId,
        modelId,
        provider,
        thinking,
        messageCount: modelMessages.length
    });

    const result = streamText({
        model,
        messages: modelMessages,
        providerOptions,
        tools,
        maxOutputTokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        maxRetries: 2,
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

            for (const part of finalParts) {
                if (part.type === "tool-invocation" && part.state === "call") {
                    part.state = "error";
                }
            }

            const generationCompletedAt = new Date().toISOString();
            const durationMs =
                new Date(generationCompletedAt).getTime() -
                new Date(generationStartedAt).getTime();
            const status = finishReason === "error" ? "failed" : "complete";
            const usage = aggregateUsage(
                steps as unknown as Array<Record<string, unknown>>
            );

            logger.info("Generation finished", {
                conversationId: generation.conversationId,
                messageId: assistantMessageId,
                modelId,
                finishReason,
                status,
                steps: steps.length,
                durationMs,
                usage
            });

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: finalParts,
                status,
                metadata: {
                    model: modelId,
                    provider,
                    thinkingEnabled: thinking,
                    generationStartedAt,
                    generationCompletedAt,
                    usage
                }
            });

            if (
                status === "complete" &&
                hasMeaningfulAssistantOutput(finalParts)
            ) {
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
            const errorMessage = extractErrorMessage(event.error);

            logger.error("Generation failed (onError)", {
                conversationId: generation.conversationId,
                messageId: assistantMessageId,
                modelId,
                error: errorMessage,
                durationMs
            });

            const errorParts = buildAccumulatedParts(generation, thinking, true);

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: errorParts,
                status: "failed",
                metadata: {
                    model: modelId,
                    provider,
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
                    generation.accumulatedText += event.text;
                } else if (event.type === "reasoning" && thinking) {
                    generation.accumulatedReasoning += event.text;
                } else if (event.type === "tool-call") {
                    logger.debug("Tool call", {
                        conversationId: generation.conversationId,
                        toolName: event.toolName,
                        toolCallId: event.toolCallId,
                        args: event.args
                    });
                    upsertToolInvocationPart(generation.toolParts, {
                        type: "tool-invocation",
                        toolInvocationId: event.toolCallId,
                        toolName: event.toolName,
                        args: event.args,
                        state: "call"
                    });
                } else if (event.type === "tool-result") {
                    logger.debug("Tool result", {
                        conversationId: generation.conversationId,
                        toolName: event.toolName,
                        toolCallId: event.toolCallId
                    });
                    applyToolResult(generation.toolParts, {
                        toolCallId: event.toolCallId,
                        toolName: event.toolName,
                        output: event.result
                    });
                }

                if (event.type !== "reasoning" || thinking) {
                    generation.emitter.emit("event", event);
                }
            }
        } catch (error) {
            const isAbort =
                (error instanceof Error && error.name === "AbortError") ||
                generation.abortController.signal.aborted;

            if (isAbort) {
                logger.info("Generation stopped by user", {
                    conversationId: generation.conversationId,
                    messageId: assistantMessageId
                });

                const stoppedParts = buildAccumulatedParts(
                    generation,
                    thinking,
                    false
                );

                await conversationsRepository.updateMessage(
                    assistantMessageId,
                    {
                        parts: stoppedParts,
                        status: "complete",
                        metadata: {
                            model: modelId,
                            provider,
                            thinkingEnabled: thinking,
                            generationStartedAt,
                            generationCompletedAt: new Date().toISOString()
                        }
                    }
                );

                generationManager.complete(generation.conversationId);
                return;
            }

            const streamErrorMessage = extractErrorMessage(error);

            logger.error("Stream loop error", {
                conversationId: generation.conversationId,
                messageId: assistantMessageId,
                error: streamErrorMessage
            });

            const errorParts = buildAccumulatedParts(generation, thinking, true);

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: errorParts,
                status: "failed",
                metadata: {
                    model: modelId,
                    provider,
                    thinkingEnabled: thinking,
                    generationStartedAt,
                    generationCompletedAt: new Date().toISOString(),
                    errorMessage: streamErrorMessage
                }
            });

            generationManager.fail(
                generation.conversationId,
                streamErrorMessage
            );
        }
    })();
}

export const aiService = {
    async generateResponse(
        request: Request,
        conversationId: string,
        modelId: string,
        provider: string,
        thinking = false
    ): Promise<Response> {
        const user = await requireAuth(request);

        if (generationManager.isActive(conversationId)) {
            throw new ConversationError(
                409,
                "A generation is already in progress for this conversation."
            );
        }

        const resolvedProvider: ProviderType = isValidProvider(provider)
            ? provider
            : "openrouter";

        const apiKey = await settingsService.getDecryptedApiKeyForUser(
            user.id,
            resolvedProvider
        );

        if (!apiKey) {
            logger.warn("Generation rejected: no API key", {
                conversationId,
                userId: user.id,
                provider: resolvedProvider
            });
            throw new ConversationError(
                400,
                `Add your ${resolvedProvider === "openrouter" ? "OpenRouter" : resolvedProvider.charAt(0).toUpperCase() + resolvedProvider.slice(1)} API key in settings to use this model.`
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

        let messagesWithSystemPrompt: ModelMessage[];

        try {
            const contextResult = buildOptimizedContext(
                messageRecords,
                buildSystemPrompt(),
                {
                    modelContextLength: modelsService.getModelContextLength(
                        user.id,
                        modelId
                    ),
                    thinking
                },
                toModelMessages
            );

            messagesWithSystemPrompt = contextResult.messages;

            logger.info("Context optimized", {
                conversationId,
                modelId,
                originalMessages: contextResult.originalMessageCount,
                includedMessages: contextResult.includedMessageCount,
                estimatedTokens: contextResult.estimatedTokens,
                truncated: contextResult.truncated
            });
        } catch (ctxError) {
            logger.warn("Context optimization failed, using raw messages", {
                conversationId,
                error:
                    ctxError instanceof Error
                        ? ctxError.message
                        : String(ctxError)
            });

            messagesWithSystemPrompt = [
                { role: "system", content: buildSystemPrompt() },
                ...toModelMessages(messageRecords)
            ];
        }

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
                provider: resolvedProvider,
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
        const modelMaxOutputTokens = modelsService.getModelMaxOutputTokens(
            user.id,
            modelId
        );

        startBackgroundGeneration(
            generation,
            messagesWithSystemPrompt,
            modelId,
            resolvedProvider,
            apiKey,
            generationStartedAt,
            thinking,
            tools,
            modelMaxOutputTokens
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
