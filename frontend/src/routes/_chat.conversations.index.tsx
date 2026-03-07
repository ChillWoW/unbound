import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/conversations/")({
    component: ConversationsIndexPage
});

function ConversationsIndexPage() {
    return <></>;
}
