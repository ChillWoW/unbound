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
                name: name.trim() || undefined,
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
        <div className="flex min-h-screen items-center justify-center">
            <div className="flex flex-col gap-4 bg-dark-800 p-4 rounded-md w-full max-w-sm md:max-w-md shadow-md">
                <h1 className="text-2xl font-bold text-center">
                    Create your account
                </h1>

                <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-dark-50">Name</span>
                        <Input
                            autoComplete="name"
                            className="bg-dark-600"
                            placeholder="Your name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-dark-50">Email</span>
                        <Input
                            autoComplete="email"
                            className="bg-dark-600"
                            placeholder="you@example.com"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-dark-50">Password</span>
                        <PasswordInput
                            autoComplete="new-password"
                            className="bg-dark-600"
                            placeholder="Use at least 8 characters"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                        />
                    </label>

                    {error && (
                        <div className="rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        variant="primary"
                        className="w-full mt-2"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Creating account..." : "Register"}
                    </Button>

                    <Link
                        to="/login"
                        className="text-sm text-center text-dark-50 hover:text-dark-100"
                    >
                        Already have an account? Login here
                    </Link>
                </form>
            </div>
            {/*<div className="text-xs uppercase tracking-[0.28em] text-dark-200">
                Get started
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                Create your account
            </h2>
            <p className="mt-3 text-sm leading-6 text-dark-100">
                Register once, receive a secure session cookie, and unlock
                protected routes later.
            </p>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                <label className="block space-y-2">
                    <span className="text-sm text-dark-100">Name</span>
                    <Input
                        autoComplete="name"
                        className="h-12 rounded-xl px-3"
                        placeholder="Your name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>

                <label className="block space-y-2">
                    <span className="text-sm text-dark-100">Email</span>
                    <Input
                        autoComplete="email"
                        className="h-12 rounded-xl px-3"
                        placeholder="you@example.com"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                </label>

                <label className="block space-y-2">
                    <span className="text-sm text-dark-100">Password</span>
                    <PasswordInput
                        autoComplete="new-password"
                        className="h-12 rounded-xl px-3"
                        placeholder="Use at least 8 characters"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                    />
                </label>

                {error && (
                    <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {error}
                    </div>
                )}

                <Button
                    type="submit"
                    variant="primary"
                    className="h-12 w-full rounded-xl text-sm"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? "Creating account..." : "Register"}
                </Button>
            </form>*/}
        </div>
    );
}
