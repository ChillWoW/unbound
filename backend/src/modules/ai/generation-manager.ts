import { EventEmitter } from "node:events";
import type { MessagePart } from "../conversations/conversations.types";

export interface SSEEvent {
    type: string;
    [key: string]: unknown;
}

export interface GenerationEntry {
    conversationId: string;
    userId: string;
    messageId: string;
    emitter: EventEmitter;
    finished: boolean;
    accumulatedText: string;
    toolParts: MessagePart[];
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
            finished: false,
            accumulatedText: "",
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

    complete(conversationId: string) {
        const entry = this.active.get(conversationId);
        if (!entry) return;
        entry.finished = true;
        entry.emitter.emit("event", { type: "done" });
        setTimeout(() => this.remove(conversationId), 5000);
    }

    fail(conversationId: string, error?: string) {
        const entry = this.active.get(conversationId);
        if (!entry) return;
        entry.finished = true;
        entry.emitter.emit("event", {
            type: "error",
            error: error ?? "Generation failed"
        });
        entry.emitter.emit("event", { type: "done" });
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
