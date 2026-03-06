import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "@/features/auth/auth-context";

export const Route = createRootRoute({
    component: RootLayout
});

function RootLayout() {
    return (
        <div className="min-h-screen bg-dark-900 text-white">
            <AuthProvider>
                <Outlet />
            </AuthProvider>
        </div>
    );
}
