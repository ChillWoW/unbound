import { useEffect, useMemo, useState } from "react";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "@phosphor-icons/react";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";
import { settingsApi } from "@/features/settings/api";
import type { UserSettingsSummary } from "@/features/settings/types";
import { ApiError } from "@/lib/api";

const defaultSettings: UserSettingsSummary = {
    hasOpenRouterApiKey: false,
    openRouterApiKeyPreview: null,
    openRouterApiKeyUpdatedAt: null
};

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

export const Route = createFileRoute("/_chat/settings")({
    component: SettingsPage
});

function SettingsPage() {
    const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const [settings, setSettings] =
        useState<UserSettingsSummary>(defaultSettings);
    const [apiKey, setApiKey] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    useEffect(() => {
        if (isAuthLoading || !isAuthenticated) {
            return;
        }

        let cancelled = false;
        setIsLoadingSettings(true);
        setError(null);

        void settingsApi
            .getSettings()
            .then((response) => {
                if (!cancelled) {
                    setSettings(response.settings);
                }
            })
            .catch((loadError) => {
                if (!cancelled) {
                    setError(getErrorMessage(loadError));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoadingSettings(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isAuthLoading, isAuthenticated]);

    const updatedAtLabel = useMemo(() => {
        if (!settings.openRouterApiKeyUpdatedAt) {
            return null;
        }

        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(new Date(settings.openRouterApiKeyUpdatedAt));
    }, [settings.openRouterApiKeyUpdatedAt]);

    async function handleSave(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setNotice(null);

        const trimmedApiKey = apiKey.trim();

        if (!trimmedApiKey) {
            setError("OpenRouter API key is required.");
            return;
        }

        setIsSaving(true);

        try {
            const response =
                await settingsApi.updateOpenRouterApiKey(trimmedApiKey);
            setSettings(response.settings);
            setApiKey("");
            setNotice("OpenRouter API key saved.");
        } catch (saveError) {
            setError(getErrorMessage(saveError));
        } finally {
            setIsSaving(false);
        }
    }

    async function handleRemove() {
        setError(null);
        setNotice(null);
        setIsRemoving(true);

        try {
            const response = await settingsApi.removeOpenRouterApiKey();
            setSettings(response.settings);
            setNotice("OpenRouter API key removed.");
        } catch (removeError) {
            setError(getErrorMessage(removeError));
        } finally {
            setIsRemoving(false);
        }
    }

    if (!isAuthLoading && !isAuthenticated) {
        return <Navigate to="/login" />;
    }

    if (isAuthLoading || (isAuthenticated && isLoadingSettings)) {
        return (
            <section className="flex h-full items-center justify-center px-4 py-10">
                <p className="text-sm text-dark-200">Loading settings...</p>
            </section>
        );
    }

    return (
        <section className="flex h-full flex-col overflow-y-auto px-4 py-10 sm:px-6 lg:px-10">
            <div className="mx-auto w-full max-w-xl">
                <h1 className="text-lg font-semibold text-white">Settings</h1>

                <p className="mt-1 text-sm text-dark-200">
                    Manage your account and API configuration.
                </p>

                {/* OpenRouter section */}
                <div className="mt-8">
                    <div className="flex items-center gap-2 text-sm font-medium text-dark-100">
                        <ShieldCheck className="size-4 text-dark-200" />
                        OpenRouter API key
                    </div>

                    <div className="mt-3 rounded-md border border-dark-600 bg-dark-800/80 p-4">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-dark-200">Status:</span>
                            <span
                                className={
                                    settings.hasOpenRouterApiKey
                                        ? "text-emerald-400"
                                        : "text-dark-300"
                                }
                            >
                                {settings.hasOpenRouterApiKey
                                    ? "Configured"
                                    : "Not configured"}
                            </span>
                        </div>

                        {settings.openRouterApiKeyPreview ? (
                            <p className="mt-2 text-sm text-dark-200">
                                Key: {settings.openRouterApiKeyPreview}
                            </p>
                        ) : null}

                        {updatedAtLabel ? (
                            <p className="mt-1 text-xs text-dark-300">
                                Updated {updatedAtLabel}
                            </p>
                        ) : null}
                    </div>
                </div>

                <form className="mt-4 space-y-3" onSubmit={handleSave}>
                    <label className="block space-y-1.5">
                        <span className="text-sm text-dark-200">
                            New API key
                        </span>
                        <Input
                            value={apiKey}
                            onChange={(event) => setApiKey(event.target.value)}
                            placeholder="sk-or-v1-..."
                            autoComplete="off"
                            leftSection={
                                <ShieldCheck className="size-4 text-dark-300" />
                            }
                            className="bg-dark-800/80"
                            disabled={
                                isLoadingSettings || isSaving || isRemoving
                            }
                        />
                    </label>

                    {error ? (
                        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {error}
                        </div>
                    ) : null}

                    {notice ? (
                        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                            {notice}
                        </div>
                    ) : null}

                    <div className="flex items-center gap-2 pt-1">
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={
                                isLoadingSettings ||
                                isSaving ||
                                isRemoving ||
                                !apiKey.trim()
                            }
                        >
                            {isSaving ? "Saving..." : "Save key"}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleRemove}
                            disabled={
                                isLoadingSettings ||
                                isSaving ||
                                isRemoving ||
                                !settings.hasOpenRouterApiKey
                            }
                            className="text-dark-200 hover:text-white"
                        >
                            {isRemoving ? "Removing..." : "Remove key"}
                        </Button>
                    </div>
                </form>
            </div>
        </section>
    );
}
