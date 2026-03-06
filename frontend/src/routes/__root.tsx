import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
    component: RootLayout
});

function RootLayout() {
    return (
        <div className="bg-dark-900 h-screen text-white">
            <Outlet />
        </div>
    );
}
