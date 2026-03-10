import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/use-auth";
import { ChatShell } from "@/features/chat/components/chat-shell";

export const Route = createFileRoute("/_chat")({
    component: ChatLayout
});

function ChatLayout() {
    const { isAuthenticated, isLoading, isVerified } = useAuth();

    if (!isLoading && !isAuthenticated) {
        return <Navigate to="/login" />;
    }

    if (!isLoading && isAuthenticated && !isVerified) {
        return <Navigate to="/verify-email" />;
    }

    return (
        <ChatShell>
            <Outlet />
        </ChatShell>
    );
}
