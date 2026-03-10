import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
    component: ForgotPasswordPage
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

function ForgotPasswordPage() {
    const { forgotPassword } = useAuth();
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSent, setIsSent] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            await forgotPassword({ email });
            setIsSent(true);
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
                        Reset your password
                    </h1>
                    <p className="text-sm text-dark-300">
                        Enter your email and we&apos;ll send you a reset link.
                    </p>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-dark-200">
                            Email
                        </span>
                        <Input
                            autoComplete="email"
                            placeholder="you@example.com"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </label>

                    {isSent ? (
                        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                            If an account exists for that email, a password reset
                            link is on the way.
                        </div>
                    ) : null}

                    {error ? (
                        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {error}
                        </div>
                    ) : null}

                    <Button
                        type="submit"
                        variant="primary"
                        className="w-full"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Sending reset link..." : "Send reset link"}
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
