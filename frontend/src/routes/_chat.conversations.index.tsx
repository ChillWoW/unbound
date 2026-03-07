import { createFileRoute } from "@tanstack/react-router";
import { ConversationPlaceholder } from "@/features/chat/components/conversation-placeholder";

export const Route = createFileRoute("/_chat/conversations/")({
    component: ConversationsIndexPage
});

function ConversationsIndexPage() {
    return <ConversationPlaceholder />;
}
