import { createFileRoute, Navigate } from "@tanstack/react-router";
import { LoginForm } from "@/features/auth/components/login-form";
import { useAuth } from "@/features/auth/use-auth";

export const Route = createFileRoute("/login")({
    component: LoginPage
});

function LoginPage() {
    const { isAuthenticated, isLoading } = useAuth();

    if (!isLoading && isAuthenticated) {
        return <Navigate to="/" />;
    }

    return <LoginForm />;
}
