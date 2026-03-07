import { useEffect, useRef } from "react";
import type { ChatModel, ConversationDetail, MessagePart } from "../types";
import { ChatInput } from "./chat-input";

function getMessageText(parts: MessagePart[]) {
    return parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n")
        .trim();
}

interface ConversationThreadProps {
    availableModels: ChatModel[];
    conversation: ConversationDetail;
    error?: string | null;
    isSending?: boolean;
    isLoadingModels?: boolean;
    modelsError?: string | null;
    onModelChange: (modelId: string | null) => void;
    onSubmit: (value: string) => Promise<void> | void;
    selectedModelId: string | null;
}

export function ConversationThread({
    availableModels,
    conversation,
    error,
    isSending = false,
    isLoadingModels = false,
    modelsError = null,
    onModelChange,
    selectedModelId,
    onSubmit
}: ConversationThreadProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [conversation.messages.length]);

    return (
        <section className="flex h-full flex-col">
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-6"
            >
                <div className="mx-auto max-w-3xl space-y-5">
                    {conversation.messages.map((message) => {
                        const text = getMessageText(message.parts);

                        if (message.role === "user") {
                            return (
                                <div key={message.id} className="flex justify-end">
                                    <div className="max-w-[80%] rounded-2xl bg-dark-700 px-4 py-3">
                                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-white">
                                            {text || "Unsupported message part."}
                                        </p>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={message.id} className="w-full">
                                <p className="whitespace-pre-wrap text-[15px] leading-7 text-dark-100">
                                    {text || "Unsupported message part."}
                                </p>
                                {message.status !== "complete" ? (
                                    <span className="mt-2 inline-block text-xs text-dark-200">
                                        {message.status === "pending"
                                            ? "Thinking..."
                                            : `Status: ${message.status}`}
                                    </span>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="border-t border-dark-700 px-4 py-3">
                <div className="mx-auto max-w-3xl">
                    {error ? (
                        <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {error}
                        </div>
                    ) : null}

                    <ChatInput
                        models={availableModels}
                        selectedModelId={selectedModelId}
                        onSelectedModelChange={onModelChange}
                        isModelsLoading={isLoadingModels}
                        modelsError={modelsError}
                        showContextBadge
                        placeholder="Send a message..."
                        onSubmit={onSubmit}
                        disabled={isSending}
                        isSubmitting={isSending}
                    />
                </div>
            </div>
        </section>
    );
}
