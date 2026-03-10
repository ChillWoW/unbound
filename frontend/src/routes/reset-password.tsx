import { useState } from "react";
import {
    Link,
    createFileRoute,
    useNavigate
} from "@tanstack/react-router";
import { Button, PasswordInput } from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";

type ResetPasswordSearch = {
    token?: string;
};

export const Route = createFileRoute("/reset-password")({
    validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
        token: typeof search.token === "string" ? search.token : undefined
    }),
    component: ResetPasswordPage
});

function getErrorMessage(error: unknown): string {
    if (
        error instanceof ApiError &&
        typeof error.data === "object" &&
        error.data
    ) {
        const message = "message" in error.data ? error.data.message : null;

        if (typeof message === "string" && message.length > 0) {
            return message;
        }
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return "Something went wrong. Please try again.";
}

function ResetPasswordPage() {
    const navigate = useNavigate();
    const { resetPassword } = useAuth();
    const search = Route.useSearch();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const token = search.token?.trim() ?? "";

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            setError("This password reset link is invalid or incomplete.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setError(null);
        setIsSubmitting(true);

        try {
            await resetPassword({ token, password });
            notify.success({
                title: "Password reset",
                description: "Sign in with your new password."
            });
            await navigate({ to: "/login" });
        } catch (submitError) {
            setError(getErrorMessage(submitError));
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-dark-900 px-4">
            <div className="w-full max-w-md rounded-md border border-dark-600 bg-dark-900 p-6">
                <div className="mb-6 flex flex-col items-center gap-2 text-center">
                    <img src="/logos/logo.svg" alt="Logo" className="size-16" />
                    <h1 className="text-2xl font-semibold text-white">
                        Choose a new password
                    </h1>
                    <p className="text-sm text-dark-300">
                        Set a new password for your Unbound account.
                    </p>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    {!token ? (
                        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            This password reset link is invalid or incomplete.
                        </div>
                    ) : null}

                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-dark-200">
                            New password
                        </span>
                        <PasswordInput
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </label>

                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-dark-200">
                            Confirm new password
                        </span>
                        <PasswordInput
                            autoComplete="new-password"
                            placeholder="Repeat your password"
                            value={confirmPassword}
                            onChange={(event) =>
                                setConfirmPassword(event.target.value)
                            }
                        />
                    </label>

                    {error ? (
                        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {error}
                        </div>
                    ) : null}

                    <Button
                        type="submit"
                        variant="primary"
                        className="w-full"
                        disabled={isSubmitting || !token}
                    >
                        {isSubmitting ? "Resetting password..." : "Reset password"}
                    </Button>
                </form>

                <div className="mt-4 text-center text-sm text-dark-200">
                    <Link
                        to="/login"
                        className="text-dark-100 transition-colors hover:text-white"
                    >
                        Back to sign in
                    </Link>
                </div>
            </div>
        </div>
    );
}
