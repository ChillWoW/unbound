import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useChat } from "@/features/chat/chat-context";
import { ConversationThread } from "@/features/chat/components/conversation-thread";

export const Route = createFileRoute("/_chat/conversations/$conversationId")({
    component: ConversationPage
});

function ConversationPage() {
    const { conversationId } = Route.useParams();
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const {
        availableModels,
        getConversation,
        getConversationError,
        isConversationLoading,
        isConversationSending,
        isLoadingModels,
        loadConversation,
        modelsError,
        markConversationRead,
        selectedModelId,
        setSelectedModelId,
        sendMessage
    } = useChat();
    const conversation = getConversation(conversationId);
    const error = getConversationError(conversationId);
    const isLoading = isConversationLoading(conversationId);
    const isSending = isConversationSending(conversationId);

    useEffect(() => {
        void loadConversation(conversationId);
    }, [conversationId, loadConversation]);

    useEffect(() => {
        if (
            !conversation ||
            !conversation.hasUnreadAssistantReply ||
            !conversation.latestAssistantMessageId
        ) {
            return;
        }

        void markConversationRead(
            conversationId,
            conversation.latestAssistantMessageId
        );
    }, [conversation, conversationId, markConversationRead]);

    async function handleSubmit(value: string) {
        setSubmissionError(null);

        try {
            await sendMessage(conversationId, value);
        } catch (submitError) {
            if (submitError instanceof Error) {
                setSubmissionError(submitError.message);
                return;
            }

            setSubmissionError("Unable to send that message right now.");
        }
    }

    if (isLoading && !conversation) {
        return (
            <section className="flex h-full items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
                <p className="text-sm text-dark-200">
                    Loading conversation...
                </p>
            </section>
        );
    }

    if (error && !conversation) {
        return (
            <section className="flex h-full items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
                <div className="text-center">
                    <h1 className="text-xl font-medium text-white">
                        Conversation not found
                    </h1>
                    <p className="mt-2 text-sm text-dark-100">
                        {error}
                    </p>
                    <Link
                        to="/conversations"
                        className="mt-4 inline-flex rounded-md bg-dark-700 px-4 py-2 text-sm text-white transition hover:bg-dark-600"
                    >
                        Back to conversations
                    </Link>
                </div>
            </section>
        );
    }

    if (!conversation) {
        return null;
    }

    return (
        <ConversationThread
            availableModels={availableModels}
            conversation={conversation}
            error={submissionError}
            isSending={isSending}
            isLoadingModels={isLoadingModels}
            modelsError={modelsError}
            onModelChange={setSelectedModelId}
            onSubmit={handleSubmit}
            selectedModelId={selectedModelId}
        />
    );
}
