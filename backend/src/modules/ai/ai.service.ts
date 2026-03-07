import { randomBytes } from "node:crypto";
import { streamText, stepCountIs, type ModelMessage } from "ai";
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

function createMessageId(): string {
    return `msg_${randomBytes(10).toString("hex")}`;
}

function toModelMessages(records: MessageRecord[]): ModelMessage[] {
    const result: ModelMessage[] = [];

    for (const record of records) {
        const role = record.role as string;
        const parts = record.parts as MessagePart[];

        if (role === "user") {
            const text = parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("\n\n");

            if (text) {
                result.push({ role: "user", content: text });
            }
        } else if (role === "assistant") {
            const textParts = parts.filter((p) => p.type === "text");
            const toolParts = parts.filter((p) => p.type === "tool-invocation");

            const content: Array<
                | { type: "text"; text: string }
                | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }
            > = [];

            for (const p of textParts) {
                if (p.text) content.push({ type: "text", text: p.text });
            }

            for (const p of toolParts) {
                content.push({
                    type: "tool-call",
                    toolCallId: p.toolInvocationId,
                    toolName: p.toolName,
                    args: p.args
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
                        result: p.result
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

interface SSEEvent {
    type: string;
    [key: string]: unknown;
}

function encodeSSE(event: SSEEvent): Uint8Array {
    return new TextEncoder().encode(
        `data: ${JSON.stringify(event)}\n\n`
    );
}

export const aiService = {
    async generateResponse(
        request: Request,
        conversationId: string,
        modelId: string
    ): Promise<Response> {
        const user = await requireAuth(request);

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
                generationStartedAt
            }
        });

        const openrouter = createOpenRouter({ apiKey });

        const result = streamText({
            model: openrouter(modelId),
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(5),
            onFinish: async ({ steps, finishReason }) => {
                const finalParts: MessagePart[] = [];

                for (const step of steps) {
                    const stepText = step.text;
                    const stepToolCalls = step.toolCalls ?? [];
                    const stepToolResults = step.toolResults ?? [];

                    for (const call of stepToolCalls) {
                        const matchingResult = stepToolResults.find(
                            (r: { toolCallId: string }) =>
                                r.toolCallId === call.toolCallId
                        );
                        finalParts.push({
                            type: "tool-invocation",
                            toolInvocationId: call.toolCallId,
                            toolName: call.toolName,
                            args: (call as unknown as Record<string, unknown>)
                                .input as Record<string, unknown>,
                            state: matchingResult ? "result" : "call",
                            result: matchingResult
                                ? (
                                      matchingResult as unknown as Record<
                                          string,
                                          unknown
                                      >
                                  ).output
                                : undefined
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

                await conversationsRepository.updateMessage(
                    assistantMessageId,
                    {
                        parts: finalParts,
                        status:
                            finishReason === "error" ? "failed" : "complete",
                        metadata: {
                            model: modelId,
                            generationStartedAt,
                            generationCompletedAt
                        }
                    }
                );
            },
            onError: async () => {
                await conversationsRepository.updateMessage(
                    assistantMessageId,
                    {
                        status: "failed",
                        metadata: {
                            model: modelId,
                            generationStartedAt,
                            generationCompletedAt: new Date().toISOString()
                        }
                    }
                );
            }
        });

        const sseStream = new ReadableStream({
            async start(controller) {
                try {
                    controller.enqueue(
                        encodeSSE({
                            type: "message-start",
                            messageId: assistantMessageId
                        })
                    );

                    for await (const chunk of result.fullStream) {
                        switch (chunk.type) {
                            case "text-delta":
                                controller.enqueue(
                                    encodeSSE({
                                        type: "text-delta",
                                        text: chunk.text
                                    })
                                );
                                break;

                            case "tool-call":
                                controller.enqueue(
                                    encodeSSE({
                                        type: "tool-call",
                                        toolCallId: chunk.toolCallId,
                                        toolName: chunk.toolName,
                                        args: (
                                            chunk as unknown as Record<
                                                string,
                                                unknown
                                            >
                                        ).input
                                    })
                                );
                                break;

                            case "tool-result":
                                controller.enqueue(
                                    encodeSSE({
                                        type: "tool-result",
                                        toolCallId: chunk.toolCallId,
                                        toolName: chunk.toolName,
                                        result: (
                                            chunk as unknown as Record<
                                                string,
                                                unknown
                                            >
                                        ).output
                                    })
                                );
                                break;

                            case "error":
                                controller.enqueue(
                                    encodeSSE({
                                        type: "error",
                                        error: String(chunk.error)
                                    })
                                );
                                break;

                            case "finish":
                                controller.enqueue(
                                    encodeSSE({
                                        type: "finish",
                                        finishReason: chunk.finishReason
                                    })
                                );
                                break;
                        }
                    }

                    controller.enqueue(
                        encodeSSE({ type: "done" })
                    );
                } catch (error) {
                    controller.enqueue(
                        encodeSSE({
                            type: "error",
                            error:
                                error instanceof Error
                                    ? error.message
                                    : "Stream failed"
                        })
                    );
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(sseStream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "X-Message-Id": assistantMessageId
            }
        });
    }
};
