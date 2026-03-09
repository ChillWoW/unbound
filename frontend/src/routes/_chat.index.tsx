import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/use-auth";
import { useChat } from "@/features/chat/chat-context";
import { ChatInput } from "@/features/chat/components/chat-input";

export const Route = createFileRoute("/_chat/")({
    component: HomePage
});

const TITLES = [
    "How can I help you today?",
    "What's on your mind?",
    "What are we working on?",
    "What do you need?",
    "Let's figure it out.",
    "Where do you want to start?",
    "What can I do for you?"
];

function HomePage() {
    const [draft, setDraft] = useState("");
    const title = useMemo(
        () => TITLES[Math.floor(Math.random() * TITLES.length)],
        []
    );
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { isAuthenticated, isLoading } = useAuth();
    const {
        availableModels,
        configuredProviders,
        createConversation,
        isCreatingConversation,
        isLoadingModels,
        modelsError,
        isThinkingEnabled,
        selectedModelId,
        setSelectedModelId,
        setThinkingEnabled
    } = useChat();

    async function handleSubmit(
        value: string,
        attachments: import("@/features/chat/components/chat-input").ChatAttachment[]
    ) {
        setError(null);

        if (!isAuthenticated) {
            await navigate({ to: "/login" });
            return;
        }

        try {
            const conversation = await createConversation(value, attachments);
            setDraft("");
            await navigate({
                to: "/conversations/$conversationId",
                params: { conversationId: conversation.id }
            });
        } catch (submitError) {
            if (submitError instanceof Error) {
                setError(submitError.message);
                return;
            }

            setError("Unable to create the conversation right now.");
        }
    }

    return (
        <main className="flex h-full items-center justify-center px-4">
            <div className="flex flex-col gap-8 items-center w-full max-w-xl">
                <p className="text-2xl font-semibold animate-fade-in animate-duration-500 animate-ease-out">
                    {title}
                </p>

                {error && (
                    <p className="text-sm text-red-500 animate-fade-in animate-duration-200">
                        {error}
                    </p>
                )}

                <div className="w-full animate-fade-up animate-duration-500 animate-delay-150 animate-ease-out">
                    <ChatInput
                        disabled={
                            isLoading ||
                            isCreatingConversation ||
                            !isAuthenticated
                        }
                        isSubmitting={isCreatingConversation}
                        isModelsLoading={isLoadingModels}
                        isThinkingEnabled={isThinkingEnabled}
                        models={availableModels}
                        configuredProviders={configuredProviders}
                        modelsError={modelsError}
                        selectedModelId={selectedModelId}
                        onSelectedModelChange={setSelectedModelId}
                        onThinkingChange={setThinkingEnabled}
                        value={draft}
                        onChange={setDraft}
                        onSubmit={handleSubmit}
                        placeholder={
                            isAuthenticated
                                ? "Message Unbound..."
                                : "Sign in to start chatting..."
                        }
                    />
                </div>
            </div>
        </main>
    );
}
