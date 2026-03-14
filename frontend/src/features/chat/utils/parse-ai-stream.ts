import { parseChatErrorRecovery } from "../recovery";
import type { ChatErrorRecovery } from "../types";

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

export interface StreamErrorEvent {
    message: string;
    recovery?: ChatErrorRecovery;
}

export interface StreamCallbacks {
    onMessageStart?: (messageId: string, deepResearch?: boolean) => void;
    onConversationTitle?: (title: string, titleSource: string) => void;
    onTextDelta?: (text: string) => void;
    onReasoning?: (text: string) => void;
    onToolCallStart?: (toolCall: {
        toolCallId: string;
        toolName: string;
    }) => void;
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
    onError?: (error: StreamErrorEvent) => void;
    onReconnectState?: (state: ReconnectState) => void;
    onBudgetWarning?: (warning: {
        percentUsed: number;
        monthlySpendCents: number;
        monthlyLimitCents: number;
    }) => void;
}

export async function parseAIStream(
    response: Response,
    callbacks: StreamCallbacks
): Promise<void> {
    const body = response.body;

    if (!body) {
        callbacks.onError?.({ message: "No response body" });
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
                        callbacks.onMessageStart?.(
                            event.messageId as string,
                            event.deepResearch === true ? true : undefined
                        );
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

                    case "tool-call-start":
                        callbacks.onToolCallStart?.({
                            toolCallId: event.toolCallId as string,
                            toolName: event.toolName as string
                        });
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
                        callbacks.onError?.({
                            message: event.error as string,
                            recovery:
                                parseChatErrorRecovery(event.recovery) ?? undefined
                        });
                        break;

                    case "reconnect-state":
                        callbacks.onReconnectState?.(
                            event as unknown as ReconnectState
                        );
                        break;

                    case "budget-warning":
                        callbacks.onBudgetWarning?.({
                            percentUsed: event.percentUsed as number,
                            monthlySpendCents: event.monthlySpendCents as number,
                            monthlyLimitCents: event.monthlyLimitCents as number
                        });
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
                        callbacks.onError?.({
                            message: event.error as string,
                            recovery:
                                parseChatErrorRecovery(event.recovery) ?? undefined
                        });
                    }
                } catch {
                    // ignore partial data
                }
            }
        }
    } catch (error) {
        callbacks.onError?.({
            message:
                error instanceof Error ? error.message : "Stream reading failed"
        });
    } finally {
        reader.releaseLock();
    }
}
