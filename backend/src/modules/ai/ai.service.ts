import { randomBytes } from "node:crypto";
import { generateText, streamText, stepCountIs, type ModelMessage } from "ai";
import { env } from "../../config/env";
import { requireVerifiedAuth } from "../../middleware/require-auth";
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
import { memoryService } from "../memory/memory.service";

import { toModelMessages, buildSystemPrompt, buildDeepResearchSystemPrompt } from "./message-converter";
import { buildProviderOptions } from "./provider-options";
import {
    upsertToolInvocationPart,
    applyToolResult,
    buildAccumulatedParts
} from "./message-parts";
import { encodeSSE, mapChunkToEvent, createSubscriberStream } from "./sse";
import {
    AIGenerationError,
    createMissingApiKeyRecovery,
    createUnsupportedImageInputRecovery,
    inferAIRecovery,
    type AIRecoveryInfo
} from "./ai-recovery";
import { extractSourcesFromParts } from "./citations";
import type { ToolSet } from "./ai.tools";
import {
    inspectConversationAttachmentRequirements,
    resolveModelAttachmentCapabilities
} from "./model-attachment-capabilities";

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

function buildErrorMetadata(input: {
    modelId: string;
    provider: ProviderType;
    thinking: boolean;
    generationStartedAt: string;
    generationCompletedAt: string;
    errorMessage: string;
    recovery?: AIRecoveryInfo | null;
    sources?: ReturnType<typeof extractSourcesFromParts>;
}) {
    const {
        modelId,
        provider,
        thinking,
        generationStartedAt,
        generationCompletedAt,
        errorMessage,
        recovery
    } = input;

    return {
        model: modelId,
        provider,
        thinkingEnabled: thinking,
        generationStartedAt,
        generationCompletedAt,
        errorMessage,
        ...(input.sources && input.sources.length > 0
            ? { sources: input.sources }
            : {}),
        ...(recovery ? { errorRecovery: recovery } : {})
    };
}

function getLatestUserText(messageRecords: {
    role: string;
    parts: MessagePart[];
}[]): string {
    for (let index = messageRecords.length - 1; index >= 0; index -= 1) {
        const record = messageRecords[index];

        if (!record || record.role !== "user") {
            continue;
        }

        const text = record.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(" ")
            .trim();

        if (text) {
            return text;
        }
    }

    return "";
}

async function appendFailedAssistantMessage(input: {
    conversationId: string;
    modelId: string;
    provider: ProviderType;
    thinking: boolean;
    replyToMessageId?: string;
    errorMessage: string;
    recovery?: AIRecoveryInfo | null;
}) {
    const assistantMessageId = createMessageId();
    const generationStartedAt = new Date().toISOString();
    const generationCompletedAt = generationStartedAt;

    await conversationsRepository.appendMessageToConversation({
        conversationId: input.conversationId,
        messageId: assistantMessageId,
        messageRole: "assistant",
        messageParts: [],
        messageStatus: "failed",
        messageMetadata: buildErrorMetadata({
            modelId: input.modelId,
            provider: input.provider,
            thinking: input.thinking,
            generationStartedAt,
            generationCompletedAt,
            errorMessage: input.errorMessage,
            recovery: input.recovery
        }),
        parentMessageId: input.replyToMessageId ?? null
    });

    return assistantMessageId;
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

function aggregateUsage(steps: Array<Record<string, unknown>>): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
} {
    let promptTokens = 0;
    let completionTokens = 0;

    for (const step of steps) {
        const usage = step.usage as Record<string, unknown> | undefined;
        if (!usage) continue;
        promptTokens +=
            typeof usage.promptTokens === "number" ? usage.promptTokens : 0;
        completionTokens +=
            typeof usage.completionTokens === "number"
                ? usage.completionTokens
                : 0;
    }

    return {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
    };
}

const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const TITLE_GENERATION_MODEL_ID = "qwen/qwen3.5-9b";
const MAX_GENERATED_TITLE_LENGTH = 120;
const TITLE_MAX_OUTPUT_TOKENS = 32;

function extractTextFromParts(parts: MessagePart[]): string {
    return parts
        .filter(
            (part): part is Extract<MessagePart, { type: "text" }> =>
                part.type === "text"
        )
        .map((part) => part.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

function getInitialConversationPrompt(
    messages: MessagePart[][]
): string | null {
    if (messages.length !== 1) {
        return null;
    }

    const prompt = extractTextFromParts(messages[0] ?? []);
    return prompt || null;
}

function normalizeGeneratedTitle(value: string): string | null {
    const normalized = value
        .replace(/[\r\n]+/g, " ")
        .replace(/^\s*["'`]+|["'`]+\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!normalized) {
        return null;
    }

    if (normalized.length <= MAX_GENERATED_TITLE_LENGTH) {
        return normalized;
    }

    return `${normalized.slice(0, MAX_GENERATED_TITLE_LENGTH - 3).trimEnd()}...`;
}

async function requestGeneratedConversationTitle(
    initialPrompt: string,
    apiKey: string
): Promise<string | null> {
    const model = createModelInstance(
        "openrouter",
        TITLE_GENERATION_MODEL_ID,
        apiKey
    );

    const result = await generateText({
        model,
        system: "You generate short conversation titles. Return only the title, no quotes, no markdown, no extra text.",
        prompt: `Create a concise conversation title from this first user message only. Keep it under 8 words.\n\nUser message:\n${initialPrompt}`,
        temperature: 0.3,
        maxOutputTokens: TITLE_MAX_OUTPUT_TOKENS,
        providerOptions: {
            openrouter: {
                reasoning: {
                    effort: "none"
                }
            }
        }
    });

    return normalizeGeneratedTitle(result.text);
}

async function generateConversationTitleInBackground(input: {
    generation: GenerationEntry;
    userId: string;
    conversationId: string;
    currentTitleSource: string;
    initialPrompt: string | null;
}) {
    if (!env.openrouterTitleApiKey) {
        return;
    }

    if (input.currentTitleSource !== "prompt" || !input.initialPrompt) {
        return;
    }

    try {
        logger.info("Conversation title generation started", {
            conversationId: input.conversationId,
            modelId: TITLE_GENERATION_MODEL_ID
        });
        const title = await requestGeneratedConversationTitle(
            input.initialPrompt,
            env.openrouterTitleApiKey
        );

        if (!title) {
            logger.warn("Conversation title generation returned empty title", {
                conversationId: input.conversationId,
                modelId: TITLE_GENERATION_MODEL_ID
            });
            return;
        }

        const updated =
            await conversationsRepository.updateConversationTitleIfSourceMatches(
                {
                    userId: input.userId,
                    conversationId: input.conversationId,
                    expectedTitleSource: "prompt",
                    title,
                    titleSource: "ai"
                }
            );

        if (!updated || input.generation.finished) {
            logger.info("Conversation title update skipped", {
                conversationId: input.conversationId,
                updated: Boolean(updated),
                generationFinished: input.generation.finished
            });
            return;
        }

        logger.info("Conversation title updated", {
            conversationId: input.conversationId,
            title: updated.title,
            titleSource: updated.titleSource
        });
        input.generation.emitter.emit("event", {
            type: "conversation-title",
            title: updated.title,
            titleSource: updated.titleSource
        } satisfies SSEEvent);
    } catch (error) {
        logger.warn("Conversation title generation failed", {
            conversationId: input.conversationId,
            modelId: TITLE_GENERATION_MODEL_ID,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

const DEEP_RESEARCH_MAX_STEPS = 60;
const DEEP_RESEARCH_MAX_OUTPUT_TOKENS = 16384;

function startBackgroundGeneration(
    generation: GenerationEntry,
    modelMessages: ModelMessage[],
    modelId: string,
    provider: ProviderType,
    apiKey: string,
    generationStartedAt: string,
    thinking: boolean,
    tools: ToolSet,
    cleanupTools: () => Promise<void>,
    maxOutputTokens: number | null,
    deepResearch: boolean
) {
    const model = createModelInstance(provider, modelId, apiKey);
    const assistantMessageId = generation.messageId;
    const providerOptions = buildProviderOptions(provider, modelId, thinking);
    const generationStartedMs = Date.parse(generationStartedAt);
    let firstEventLogged = false;

    logger.info("Generation started", {
        conversationId: generation.conversationId,
        messageId: assistantMessageId,
        modelId,
        provider,
        thinking,
        messageCount: modelMessages.length
    });

    const effectiveMaxOutputTokens = deepResearch
        ? DEEP_RESEARCH_MAX_OUTPUT_TOKENS
        : (maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS);

    const result = streamText({
        model,
        messages: modelMessages,
        providerOptions,
        tools,
        maxOutputTokens: effectiveMaxOutputTokens,
        maxRetries: 2,
        stopWhen: stepCountIs(deepResearch ? DEEP_RESEARCH_MAX_STEPS : 20),
        abortSignal: generation.abortController.signal,
        onFinish: async ({ steps, finishReason }) => {
            if (generation.abortController.signal.aborted) return;
            try {
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
                const sources = extractSourcesFromParts(finalParts);

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
                        usage,
                        ...(sources.length > 0 ? { sources } : {})
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
            } catch (error) {
                logger.error("onFinish processing failed", {
                    conversationId: generation.conversationId,
                    messageId: assistantMessageId,
                    error: error instanceof Error ? error.message : String(error)
                });
            } finally {
                await cleanupTools();
                generationManager.complete(generation.conversationId);
            }
        },
        onError: async (event: { error: unknown }) => {
            if (generation.abortController.signal.aborted) return;
            const generationCompletedAt = new Date().toISOString();
            const durationMs =
                new Date(generationCompletedAt).getTime() -
                new Date(generationStartedAt).getTime();
            const errorMessage = extractErrorMessage(event.error);
            const recovery = inferAIRecovery(errorMessage, provider);

            logger.error("Generation failed (onError)", {
                conversationId: generation.conversationId,
                messageId: assistantMessageId,
                modelId,
                error: errorMessage,
                durationMs
            });

            const errorParts = buildAccumulatedParts(
                generation,
                thinking,
                true
            );
            const sources = extractSourcesFromParts(errorParts);

            await conversationsRepository.updateMessage(assistantMessageId, {
                parts: errorParts,
                status: "failed",
                metadata: buildErrorMetadata({
                    modelId,
                    provider,
                    thinking,
                    generationStartedAt,
                    generationCompletedAt,
                    errorMessage,
                    sources,
                    recovery
                })
            });

            generationManager.fail(
                generation.conversationId,
                errorMessage,
                recovery ?? undefined
            );

            await cleanupTools();
        }
    });

    (async () => {
        try {
            for await (const chunk of result.fullStream) {
                const event = mapChunkToEvent(chunk);
                if (!event) continue;

                if (!firstEventLogged) {
                    firstEventLogged = true;
                    logger.info("Generation first event", {
                        conversationId: generation.conversationId,
                        messageId: assistantMessageId,
                        modelId,
                        provider,
                        eventType: event.type,
                        latencyMs: Date.now() - generationStartedMs
                    });
                }

                switch (event.type) {
                    case "text-delta":
                        generation.accumulatedText += event.text;
                        break;
                    case "reasoning":
                        if (thinking) {
                            generation.accumulatedReasoning += event.text;
                        }
                        break;
                    case "tool-call-start":
                        upsertToolInvocationPart(generation.toolParts, {
                            type: "tool-invocation",
                            toolInvocationId: event.toolCallId,
                            toolName: event.toolName,
                            args: {},
                            state: "call"
                        });
                        break;
                    case "tool-call":
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
                        break;
                    case "tool-result":
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
                        break;
                    default:
                        break;
                }

                if (event.type !== "reasoning" || thinking) {
                    generation.emitter.emit("event", event);
                }
            }

            if (generation.abortController.signal.aborted && !generation.finished) {
                logger.info("Generation stopped by user (post-stream)", {
                    conversationId: generation.conversationId,
                    messageId: assistantMessageId
                });
                try {
                    const stoppedParts = buildAccumulatedParts(
                        generation,
                        thinking,
                        false
                    );
                    const sources = extractSourcesFromParts(stoppedParts);
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
                                generationCompletedAt: new Date().toISOString(),
                                ...(sources.length > 0 ? { sources } : {})
                            }
                        }
                    );
                } catch (dbError) {
                    logger.error("Failed to persist stopped state", {
                        conversationId: generation.conversationId,
                        messageId: assistantMessageId,
                        error: dbError instanceof Error ? dbError.message : String(dbError)
                    });
                }
                generationManager.complete(generation.conversationId);
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

                try {
                    const stoppedParts = buildAccumulatedParts(
                        generation,
                        thinking,
                        false
                    );
                    const sources = extractSourcesFromParts(stoppedParts);

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
                                generationCompletedAt: new Date().toISOString(),
                                ...(sources.length > 0 ? { sources } : {})
                            }
                        }
                    );
                } catch (dbError) {
                    logger.error("Failed to persist stopped state", {
                        conversationId: generation.conversationId,
                        messageId: assistantMessageId,
                        error: dbError instanceof Error ? dbError.message : String(dbError)
                    });
                }

                generationManager.complete(generation.conversationId);
                return;
            }

            const streamErrorMessage = extractErrorMessage(error);
            const recovery = inferAIRecovery(streamErrorMessage, provider);

            logger.error("Stream loop error", {
                conversationId: generation.conversationId,
                messageId: assistantMessageId,
                error: streamErrorMessage
            });

            try {
                const errorParts = buildAccumulatedParts(
                    generation,
                    thinking,
                    true
                );
                const sources = extractSourcesFromParts(errorParts);

                await conversationsRepository.updateMessage(assistantMessageId, {
                    parts: errorParts,
                    status: "failed",
                    metadata: buildErrorMetadata({
                        modelId,
                        provider,
                        thinking,
                        generationStartedAt,
                        generationCompletedAt: new Date().toISOString(),
                        errorMessage: streamErrorMessage,
                        sources,
                        recovery
                    })
                });
            } catch (dbError) {
                logger.error("Failed to persist error state", {
                    conversationId: generation.conversationId,
                    messageId: assistantMessageId,
                    error: dbError instanceof Error ? dbError.message : String(dbError)
                });
            }

            generationManager.fail(
                generation.conversationId,
                streamErrorMessage,
                recovery ?? undefined
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
        thinking = false,
        replyToMessageId?: string,
        deepResearch = false
    ): Promise<Response> {
        const startedAt = Date.now();
        const user = await requireVerifiedAuth(request);
        const authDurationMs = Date.now() - startedAt;

        if (generationManager.isActive(conversationId)) {
            throw new ConversationError(
                409,
                "A generation is already in progress for this conversation."
            );
        }

        const resolvedProvider: ProviderType = isValidProvider(provider)
            ? provider
            : "openrouter";

        const conversationLookupPromise = (async () => {
            const lookupStartedAt = Date.now();
            const value = await conversationsRepository.findConversationByIdForUser(
                user.id,
                conversationId
            );

            return {
                value,
                durationMs: Date.now() - lookupStartedAt
            };
        })();

        const apiKeyLookupPromise = (async () => {
            const lookupStartedAt = Date.now();
            const value = await settingsService.getDecryptedApiKeyForUser(
                user.id,
                resolvedProvider
            );

            return {
                value,
                durationMs: Date.now() - lookupStartedAt
            };
        })();

        const [conversationResult, apiKeyResult] = await Promise.all([
            conversationLookupPromise,
            apiKeyLookupPromise
        ]);
        const conversation = conversationResult.value;
        const conversationLookupDurationMs = conversationResult.durationMs;

        if (!conversation) {
            throw new ConversationError(404, "Conversation not found.");
        }

        const apiKey = apiKeyResult.value;
        const apiKeyLookupDurationMs = apiKeyResult.durationMs;

        if (!apiKey) {
            const recovery = createMissingApiKeyRecovery(resolvedProvider);
            logger.warn("Generation rejected: no API key", {
                conversationId,
                userId: user.id,
                provider: resolvedProvider
            });
            const assistantMessageId = await appendFailedAssistantMessage({
                conversationId,
                modelId,
                provider: resolvedProvider,
                thinking,
                replyToMessageId,
                errorMessage: recovery.message,
                recovery
            });
            throw new AIGenerationError(
                400,
                recovery.message,
                {
                    recovery,
                    assistantMessageId
                }
            );
        }

        const messageLoadStartedAt = Date.now();
        const messageRecords = replyToMessageId
            ? await conversationsRepository.getMessageAncestorChain(
                  conversationId,
                  replyToMessageId
              )
            : await conversationsRepository.listMessagesByConversationId(
                  conversationId
              );
        const messageLoadDurationMs = Date.now() - messageLoadStartedAt;
        const attachmentLoadStartedAt = Date.now();
        const messageAttachmentRecords =
            await conversationsRepository.listMessageAttachmentsByMessageIds(
                messageRecords.map((message) => message.id)
            );
        const attachmentLoadDurationMs = Date.now() - attachmentLoadStartedAt;
        const attachmentCapabilities = resolveModelAttachmentCapabilities({
            userId: user.id,
            modelId,
            provider: resolvedProvider
        });
        const attachmentRequirements = inspectConversationAttachmentRequirements(
            messageRecords
        );

        if (
            attachmentRequirements.hasImages &&
            attachmentCapabilities.supportsImageInput === false
        ) {
            const recovery = createUnsupportedImageInputRecovery(resolvedProvider);

            logger.warn("Generation rejected: unsupported image attachments", {
                conversationId,
                userId: user.id,
                provider: resolvedProvider,
                modelId,
                attachmentCount: messageAttachmentRecords.length,
                hasFiles: attachmentRequirements.hasFiles
            });

            const assistantMessageId = await appendFailedAssistantMessage({
                conversationId,
                modelId,
                provider: resolvedProvider,
                thinking,
                replyToMessageId,
                errorMessage: recovery.message,
                recovery
            });

            throw new AIGenerationError(400, recovery.message, {
                recovery,
                assistantMessageId
            });
        }

        const initialPrompt = getInitialConversationPrompt(
            messageRecords
                .filter((message) => message.role === "user")
                .map((message) => message.parts)
        );
        const latestUserText = getLatestUserText(messageRecords);
        const baseSystemPrompt = deepResearch
            ? buildDeepResearchSystemPrompt()
            : buildSystemPrompt();
        const systemPrompt = `${baseSystemPrompt}\n\n${await memoryService.getPromptBlockForUser(
            user.id,
            latestUserText
        )}`;

        let messagesWithSystemPrompt: ModelMessage[];

        try {
            const contextStartedAt = Date.now();
            const contextResult = await buildOptimizedContext(
                messageRecords,
                systemPrompt,
                {
                    modelContextLength: modelsService.getModelContextLength(
                        user.id,
                        modelId
                    ),
                    thinking
                },
                async (records) =>
                    toModelMessages(records, messageAttachmentRecords, {
                        supportsNativeFileInput:
                            attachmentCapabilities.supportsNativeFileInput
                    })
            );

            messagesWithSystemPrompt = contextResult.messages;

            logger.info("Context optimized", {
                conversationId,
                modelId,
                originalMessages: contextResult.originalMessageCount,
                includedMessages: contextResult.includedMessageCount,
                estimatedTokens: contextResult.estimatedTokens,
                truncated: contextResult.truncated,
                durationMs: Date.now() - contextStartedAt
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
                { role: "system", content: systemPrompt },
                ...(await toModelMessages(messageRecords, messageAttachmentRecords, {
                    supportsNativeFileInput:
                        attachmentCapabilities.supportsNativeFileInput
                }))
            ];
        }

        const assistantMessageId = createMessageId();
        const generationStartedAt = new Date().toISOString();

        const assistantInsertStartedAt = Date.now();
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
                generationStartedAt,
                ...(deepResearch ? { deepResearch: true } : {})
            },
            parentMessageId: replyToMessageId ?? null
        });
        const assistantInsertDurationMs = Date.now() - assistantInsertStartedAt;

        const generation = generationManager.register(
            conversationId,
            user.id,
            assistantMessageId,
            deepResearch
        );

        void generateConversationTitleInBackground({
            generation,
            userId: user.id,
            conversationId,
            currentTitleSource: conversation.titleSource,
            initialPrompt
        });

        const { tools, cleanup } = await createTools(
            conversationId,
            user.id,
            latestUserText,
            deepResearch
        );
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
            cleanup,
            modelMaxOutputTokens,
            deepResearch
        );

        logger.info("Generation prepared", {
            conversationId,
            messageId: assistantMessageId,
            userId: user.id,
            modelId,
            provider: resolvedProvider,
            messageCount: messageRecords.length,
            attachmentCount: messageAttachmentRecords.length,
            authDurationMs,
            conversationLookupDurationMs,
            apiKeyLookupDurationMs,
            messageLoadDurationMs,
            attachmentLoadDurationMs,
            assistantInsertDurationMs,
            durationMs: Date.now() - startedAt
        });

        return createSubscriberStream(generation, false);
    },

    async subscribeToGeneration(
        request: Request,
        conversationId: string
    ): Promise<Response> {
        const user = await requireVerifiedAuth(request);

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
