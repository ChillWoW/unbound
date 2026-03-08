import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Input, PasswordInput } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "../use-auth";

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

export function RegisterForm() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            await register({
                name: name.trim(),
                email,
                password
            });
            await navigate({ to: "/" });
        } catch (submitError) {
            setError(getErrorMessage(submitError));
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-dark-900 px-4">
            <div className="w-full max-w-sm">
                <div className="mb-6 flex flex-col items-center gap-1">
                    <img src="/logos/logo.svg" alt="Logo" className="size-16" />
                    <h1 className="text-xl font-semibold text-white">
                        Create an account
                    </h1>
                    <p className="text-sm text-dark-300">
                        Get started for free
                    </p>
                </div>

                <div className="rounded-md border border-dark-600 p-6">
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={handleSubmit}
                    >
                        <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-dark-200">
                                Name
                            </span>
                            <Input
                                autoComplete="name"
                                placeholder="Your name"
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                        </label>

                        <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-dark-200">
                                Email
                            </span>
                            <Input
                                autoComplete="email"
                                placeholder="you@example.com"
                                type="email"
                                value={email}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                            />
                        </label>

                        <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-dark-200">
                                Password
                            </span>
                            <PasswordInput
                                autoComplete="new-password"
                                placeholder="At least 8 characters"
                                value={password}
                                onChange={(event) =>
                                    setPassword(event.target.value)
                                }
                            />
                        </label>

                        {error && (
                            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            variant="primary"
                            className="w-full"
                            disabled={isSubmitting}
                        >
                            {isSubmitting
                                ? "Creating account..."
                                : "Create account"}
                        </Button>
                    </form>
                </div>

                <p className="mt-4 text-center text-sm text-dark-200">
                    Already have an account?{" "}
                    <Link
                        to="/login"
                        className="text-dark-100 hover:text-white transition-colors"
                    >
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
