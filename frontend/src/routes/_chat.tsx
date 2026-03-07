import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ChatShell } from "@/features/chat/components/chat-shell";

export const Route = createFileRoute("/_chat")({
    component: ChatLayout
});

function ChatLayout() {
    return (
        <ChatShell>
            <Outlet />
        </ChatShell>
    );
}
