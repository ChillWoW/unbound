import type {
    MessagePart,
    ToolInvocationPart
} from "../conversations/conversations.types";
import type { GenerationEntry } from "./generation-manager";

export function upsertToolInvocationPart(
    parts: Array<MessagePart | ToolInvocationPart>,
    incoming: ToolInvocationPart
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

    const existing = parts[idx] as ToolInvocationPart;

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

    const preservedArgs =
        incoming.state === "result" &&
        Object.keys(incoming.args).length === 0 &&
        Object.keys(existing.args).length > 0
            ? existing.args
            : incoming.args;

    parts[idx] = {
        ...existing,
        ...incoming,
        args: preservedArgs,
        result: incoming.state === "result" ? incoming.result : undefined
    };
}

export function applyToolResult(
    parts: Array<MessagePart | ToolInvocationPart>,
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

export function buildAccumulatedParts(
    generation: GenerationEntry,
    thinking: boolean,
    markToolsErrored: boolean
): MessagePart[] {
    const parts: MessagePart[] = [];

    if (thinking && generation.accumulatedReasoning) {
        parts.push({
            type: "reasoning",
            text: generation.accumulatedReasoning
        });
    }

    for (const tp of generation.toolParts) {
        if (markToolsErrored && tp.state === "call") {
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
