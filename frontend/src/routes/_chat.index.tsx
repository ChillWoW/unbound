import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/use-auth";
import { useChat } from "@/features/chat/chat-context";
import { ChatInput } from "@/features/chat/components/chat-input";

export const Route = createFileRoute("/_chat/")({
    component: HomePage
});

function HomePage() {
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { isAuthenticated, isLoading } = useAuth();
    const { createConversation, isCreatingConversation } = useChat();

    async function handleSubmit(value: string) {
        setError(null);

        if (!isAuthenticated) {
            await navigate({ to: "/login" });
            return;
        }

        try {
            const conversation = await createConversation(value);
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
        <main className="flex h-full items-center justify-center">
            <div className="flex flex-col gap-12 items-center w-full max-w-xl">
                <p className="text-2xl font-semibold">
                    How Can I Help You Today?
                </p>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <ChatInput
                    disabled={isLoading || isCreatingConversation}
                    isSubmitting={isCreatingConversation}
                    value={draft}
                    onChange={setDraft}
                    onSubmit={handleSubmit}
                    placeholder="Message Unbound..."
                />
            </div>
        </main>
    );
}
