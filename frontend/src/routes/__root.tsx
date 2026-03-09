import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui";
import { AuthProvider } from "@/features/auth/auth-context";
import { ChatProvider } from "@/features/chat/chat-context";

export const Route = createRootRoute({
    component: RootLayout
});

function RootLayout() {
    return (
        <div className="min-h-screen bg-dark-900 text-white">
            <AuthProvider>
                <ChatProvider>
                    <Outlet />
                    <Toaster />
                </ChatProvider>
            </AuthProvider>
        </div>
    );
}
