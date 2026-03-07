import { Link, createFileRoute } from "@tanstack/react-router";
import { WarningCircle } from "@phosphor-icons/react";
import { useChat } from "@/features/chat/chat-context";
import { ConversationPlaceholder } from "@/features/chat/components/conversation-placeholder";

export const Route = createFileRoute("/_chat/conversations/$conversationId")({
    component: ConversationPage
});

function ConversationPage() {
    const { conversationId } = Route.useParams();
    const { getConversation } = useChat();
    const conversation = getConversation(conversationId);

    if (!conversation) {
        return (
            <section className="flex min-h-full items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
                <div className="w-full max-w-xl rounded-[32px] border border-white/8 bg-white/[0.03] p-8 text-center shadow-[0_20px_80px_rgba(0,0,0,0.24)]">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                        <WarningCircle
                            className="size-7 text-primary-200"
                            weight="duotone"
                        />
                    </div>
                    <h1 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-white">
                        Placeholder not found
                    </h1>
                    <p className="mt-3 text-base leading-7 text-dark-100">
                        This route only knows about the temporary mock
                        conversations used for visual design.
                    </p>
                    <Link
                        to="/conversations"
                        className="mt-6 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]"
                    >
                        Back to placeholders
                    </Link>
                </div>
            </section>
        );
    }

    return <ConversationPlaceholder conversation={conversation} />;
}
