import { createFileRoute, Navigate } from "@tanstack/react-router";
import { LoginForm } from "@/features/auth/components/login-form";
import { useAuth } from "@/features/auth/use-auth";

export const Route = createFileRoute("/login")({
    component: LoginPage
});

function LoginPage() {
    const { isAuthenticated, isLoading, isVerified } = useAuth();

    if (!isLoading && isAuthenticated && isVerified) {
        return <Navigate to="/" />;
    }

    if (!isLoading && isAuthenticated && !isVerified) {
        return <Navigate to="/verify-email" />;
    }

    return <LoginForm />;
}
