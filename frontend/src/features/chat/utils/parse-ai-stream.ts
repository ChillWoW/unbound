export interface ReconnectState {
    text: string;
    reasoning: string;
    toolParts: Array<{
        type: "tool-invocation";
        toolInvocationId: string;
        toolName: string;
        args: Record<string, unknown>;
        state: "call" | "result" | "error";
        result?: unknown;
    }>;
}

export interface StreamCallbacks {
    onMessageStart?: (messageId: string) => void;
    onConversationTitle?: (title: string, titleSource: string) => void;
    onTextDelta?: (text: string) => void;
    onReasoning?: (text: string) => void;
    onToolCall?: (toolCall: {
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
    }) => void;
    onToolResult?: (toolResult: {
        toolCallId: string;
        toolName: string;
        result: unknown;
    }) => void;
    onFinish?: (finishReason: string) => void;
    onError?: (error: string) => void;
    onReconnectState?: (state: ReconnectState) => void;
}

export async function parseAIStream(
    response: Response,
    callbacks: StreamCallbacks
): Promise<void> {
    const body = response.body;

    if (!body) {
        callbacks.onError?.("No response body");
        return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                const trimmed = line.trim();

                if (!trimmed || !trimmed.startsWith("data: ")) {
                    continue;
                }

                const jsonStr = trimmed.slice(6);

                let event: Record<string, unknown>;
                try {
                    event = JSON.parse(jsonStr);
                } catch {
                    continue;
                }

                switch (event.type) {
                    case "message-start":
                        callbacks.onMessageStart?.(event.messageId as string);
                        break;

                    case "text-delta":
                        callbacks.onTextDelta?.(event.text as string);
                        break;

                    case "conversation-title":
                        callbacks.onConversationTitle?.(
                            event.title as string,
                            event.titleSource as string
                        );
                        break;

                    case "reasoning":
                    case "reasoning-delta":
                        callbacks.onReasoning?.(event.text as string);
                        break;

                    case "tool-call":
                        callbacks.onToolCall?.({
                            toolCallId: event.toolCallId as string,
                            toolName: event.toolName as string,
                            args: event.args as Record<string, unknown>
                        });
                        break;

                    case "tool-result":
                        callbacks.onToolResult?.({
                            toolCallId: event.toolCallId as string,
                            toolName: event.toolName as string,
                            result: event.result
                        });
                        break;

                    case "finish":
                        callbacks.onFinish?.(event.finishReason as string);
                        break;

                    case "error":
                        callbacks.onError?.(event.error as string);
                        break;

                    case "reconnect-state":
                        callbacks.onReconnectState?.(
                            event as unknown as ReconnectState
                        );
                        break;

                    case "done":
                        break;
                }
            }
        }

        if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith("data: ")) {
                try {
                    const event = JSON.parse(trimmed.slice(6));
                    if (event.type === "done") {
                        // stream complete
                    } else if (event.type === "error") {
                        callbacks.onError?.(event.error as string);
                    }
                } catch {
                    // ignore partial data
                }
            }
        }
    } catch (error) {
        callbacks.onError?.(
            error instanceof Error ? error.message : "Stream reading failed"
        );
    } finally {
        reader.releaseLock();
    }
}
