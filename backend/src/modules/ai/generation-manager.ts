import { EventEmitter } from "node:events";
import type { ToolInvocationPart } from "../conversations/conversations.types";

export type SSEEvent =
    | { type: "message-start"; messageId: string }
    | { type: "text-delta"; text: string }
    | { type: "reasoning"; text: string }
    | {
          type: "tool-call";
          toolCallId: string;
          toolName: string;
          args: Record<string, unknown>;
      }
    | {
          type: "tool-result";
          toolCallId: string;
          toolName: string;
          result: unknown;
      }
    | { type: "finish"; finishReason: string }
    | { type: "error"; error: string }
    | {
          type: "reconnect-state";
          text: string;
          reasoning: string;
          toolParts: ToolInvocationPart[];
      }
    | { type: "done" };

export interface GenerationEntry {
    conversationId: string;
    userId: string;
    messageId: string;
    emitter: EventEmitter;
    abortController: AbortController;
    finished: boolean;
    accumulatedText: string;
    accumulatedReasoning: string;
    toolParts: ToolInvocationPart[];
}

class GenerationManager {
    private active = new Map<string, GenerationEntry>();

    register(
        conversationId: string,
        userId: string,
        messageId: string
    ): GenerationEntry {
        this.remove(conversationId);

        const entry: GenerationEntry = {
            conversationId,
            userId,
            messageId,
            emitter: new EventEmitter(),
            abortController: new AbortController(),
            finished: false,
            accumulatedText: "",
            accumulatedReasoning: "",
            toolParts: []
        };

        entry.emitter.setMaxListeners(20);
        this.active.set(conversationId, entry);
        return entry;
    }

    get(conversationId: string): GenerationEntry | undefined {
        return this.active.get(conversationId);
    }

    isActive(conversationId: string): boolean {
        const entry = this.active.get(conversationId);
        return !!entry && !entry.finished;
    }

    stop(conversationId: string) {
        const entry = this.active.get(conversationId);
        if (!entry) return;
        entry.abortController.abort();
    }

    complete(conversationId: string) {
        const entry = this.active.get(conversationId);
        if (!entry) return;
        entry.finished = true;
        entry.emitter.emit("event", { type: "done" } satisfies SSEEvent);
        setTimeout(() => this.remove(conversationId), 5000);
    }

    fail(conversationId: string, error?: string) {
        const entry = this.active.get(conversationId);
        if (!entry) return;
        entry.finished = true;
        entry.emitter.emit("event", {
            type: "error",
            error: error ?? "Generation failed"
        } satisfies SSEEvent);
        entry.emitter.emit("event", { type: "done" } satisfies SSEEvent);
        setTimeout(() => this.remove(conversationId), 5000);
    }

    private remove(conversationId: string) {
        const entry = this.active.get(conversationId);
        if (entry) {
            entry.finished = true;
            entry.emitter.removeAllListeners();
            this.active.delete(conversationId);
        }
    }
}

export const generationManager = new GenerationManager();
