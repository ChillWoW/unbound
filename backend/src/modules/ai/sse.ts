import type { GenerationEntry, SSEEvent } from "./generation-manager";

const encoder = new TextEncoder();

export function encodeSSE(event: SSEEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function mapChunkToEvent(chunk: unknown): SSEEvent | null {
    const c = chunk as Record<string, unknown>;

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
        case "reasoning-delta": {
            const text =
                typeof c.text === "string"
                    ? c.text
                    : typeof c.textDelta === "string"
                      ? c.textDelta
                      : null;
            return text ? { type: "reasoning", text } : null;
        }

        case "error":
            return {
                type: "error",
                error: String(c.error)
            };

        case "finish":
            return { type: "finish", finishReason: c.finishReason as string };

        default:
            return null;
    }
}

export function createSubscriberStream(
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
