import { createFileRoute, Navigate } from "@tanstack/react-router";
import { RegisterForm } from "@/features/auth/components/register-form";
import { useAuth } from "@/features/auth/use-auth";

export const Route = createFileRoute("/register")({
    component: RegisterPage
});

function RegisterPage() {
    const { isAuthenticated, isLoading } = useAuth();

    if (!isLoading && isAuthenticated) {
        return <Navigate to="/" />;
    }

    return <RegisterForm />;
}
