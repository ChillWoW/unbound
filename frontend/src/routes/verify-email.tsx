import { useEffect, useMemo, useRef, useState } from "react";
import {
    Link,
    Navigate,
    createFileRoute,
    useNavigate
} from "@tanstack/react-router";
import { Button, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";
import { useAuth } from "@/features/auth/use-auth";

type VerifyEmailSearch = {
    email?: string;
    token?: string;
};

export const Route = createFileRoute("/verify-email")({
    validateSearch: (search: Record<string, unknown>): VerifyEmailSearch => ({
        email: typeof search.email === "string" ? search.email : undefined,
        token: typeof search.token === "string" ? search.token : undefined
    }),
    component: VerifyEmailPage
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

function VerifyEmailPage() {
    const navigate = useNavigate();
    const search = Route.useSearch();
    const {
        isAuthenticated,
        isLoading,
        isVerified,
        resendVerification,
        user,
        verifyEmail
    } = useAuth();
    const [email, setEmail] = useState(search.email ?? "");
    const [error, setError] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isVerifiedByLink, setIsVerifiedByLink] = useState(false);
    const attemptedTokenRef = useRef<string | null>(null);
    const redirectTimerRef = useRef<number | null>(null);

    const token = search.token?.trim() ?? "";
    const resendEmail = useMemo(
        () => user?.email ?? search.email ?? email.trim(),
        [email, search.email, user?.email]
    );

    useEffect(() => {
        if (!token || attemptedTokenRef.current === token) {
            return;
        }

        attemptedTokenRef.current = token;
        let cancelled = false;

        async function runVerification() {
            setError(null);
            setIsVerifying(true);

            try {
                await verifyEmail(token);

                if (cancelled) {
                    return;
                }

                setIsVerifiedByLink(true);
                notify.success({
                    title: "Email verified",
                    description: "Your account is ready to use."
                });
                redirectTimerRef.current = window.setTimeout(() => {
                    void navigate({ to: "/" });
                }, 1500);
            } catch (verifyError) {
                if (cancelled) {
                    return;
                }

                setError(getErrorMessage(verifyError));
            } finally {
                if (!cancelled) {
                    setIsVerifying(false);
                }
            }
        }

        void runVerification();

        return () => {
            cancelled = true;

            if (redirectTimerRef.current !== null) {
                window.clearTimeout(redirectTimerRef.current);
                redirectTimerRef.current = null;
            }
        };
    }, [navigate, token, verifyEmail]);

    async function handleResend() {
        setError(null);
        setIsSending(true);

        try {
            await resendVerification(resendEmail ? { email: resendEmail } : {});
            notify.success({
                title: "Verification email sent",
                description: "Check your inbox for a fresh verification link."
            });
        } catch (sendError) {
            setError(getErrorMessage(sendError));
        } finally {
            setIsSending(false);
        }
    }

    if (!isLoading && isAuthenticated && isVerified && !token) {
        return <Navigate to="/" />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-dark-900 px-4">
            <div className="w-full max-w-md rounded-md border border-dark-600 bg-dark-900 p-6">
                <div className="mb-6 flex flex-col items-center gap-2 text-center">
                    <img src="/logos/logo.svg" alt="Logo" className="size-16" />
                    <h1 className="text-2xl font-semibold text-white">
                        Verify your email
                    </h1>
                    <p className="text-sm text-dark-300">
                        Confirm your email address before you start using
                        Unbound.
                    </p>
                </div>

                {isVerifying ? (
                    <div className="rounded-md border border-dark-600 bg-dark-800 px-4 py-3 text-sm text-dark-100">
                        Verifying your email...
                    </div>
                ) : (
                    <div className="space-y-4">
                        {isVerifiedByLink ? (
                            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                                Your email has been verified successfully. You
                                will be redirected in a moment.
                            </div>
                        ) : null}

                        <div className="rounded-md border border-dark-600 bg-dark-800 px-4 py-3 text-sm text-dark-100">
                            {user?.email ?? search.email ? (
                                <>
                                    We sent a verification link to <br />
                                    <span className="font-medium text-white">
                                        {user?.email ?? search.email}
                                    </span>
                                </>
                            ) : (
                                "Open the verification link from your inbox, or request a new one below."
                            )}
                        </div>

                        {error ? (
                            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                {error}
                            </div>
                        ) : null}

                        {!user && !search.email ? (
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
                        ) : null}

                        <Button
                            type="button"
                            variant="primary"
                            className="w-full"
                            disabled={isSending || (!user && !resendEmail)}
                            onClick={handleResend}
                        >
                            {isSending
                                ? "Sending verification email..."
                                : "Resend verification email"}
                        </Button>

                        {isVerifiedByLink ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() => navigate({ to: "/" })}
                            >
                                Continue to app
                            </Button>
                        ) : null}

                        <div className="text-center text-sm text-dark-200">
                            <Link
                                to="/login"
                                className="text-dark-100 transition-colors hover:text-white"
                            >
                                Back to sign in
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
