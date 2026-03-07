import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sparkle } from "@phosphor-icons/react";
import { useChat } from "@/features/chat/chat-context";
import { ChatInput } from "@/features/chat/components/chat-input";
import { mockStarterPrompts } from "@/features/chat/mock-conversations";

export const Route = createFileRoute("/_chat/")({
    component: HomePage
});

function HomePage() {
    const [draft, setDraft] = useState("");
    const navigate = useNavigate();
    const { createConversation } = useChat();

    function handleSubmit(value: string) {
        const conversation = createConversation(value);
        setDraft("");
        void navigate({
            to: "/conversations/$conversationId",
            params: { conversationId: conversation.id }
        });
    }

    return (
        <main className="flex min-h-full items-center px-4 py-10 sm:px-6 lg:px-10">
            <div className="mx-auto w-full max-w-5xl">
                <div className="mx-auto max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.3em] text-dark-200">
                        <Sparkle
                            className="size-4 text-primary-300"
                            weight="fill"
                        />
                        Front page in progress
                    </div>

                    <h1 className="mt-6 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
                        What should we build into this workspace next?
                    </h1>

                    <p className="mt-5 text-base leading-7 text-dark-100 sm:text-lg">
                        This shell mirrors the calm, chat-first feeling of
                        Claude and OpenAI while staying ready for your real
                        backend integration later.
                    </p>
                </div>

                <div className="mt-10">
                    <ChatInput
                        value={draft}
                        onChange={setDraft}
                        onSubmit={handleSubmit}
                        placeholder="Message Unbound..."
                    />
                </div>

                <div className="mx-auto mt-6 grid max-w-4xl gap-3 sm:grid-cols-3">
                    {mockStarterPrompts.map((prompt) => (
                        <button
                            key={prompt}
                            type="button"
                            className="rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4 text-left text-sm leading-6 text-dark-50 transition hover:border-white/14 hover:bg-white/[0.06] hover:text-white"
                            onClick={() => setDraft(prompt)}
                        >
                            {prompt}
                        </button>
                    ))}
                </div>
            </div>
        </main>
    );
}
