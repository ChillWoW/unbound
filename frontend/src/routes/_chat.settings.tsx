import { useEffect, useMemo, useState } from "react";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import {
    ShieldCheckIcon,
    KeyIcon,
    CheckCircleIcon,
    XCircleIcon,
    type IconWeight
} from "@phosphor-icons/react";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";
import { settingsApi } from "@/features/settings/api";
import type { UserSettingsSummary } from "@/features/settings/types";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

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

type Category = "api-keys";

const CATEGORIES: {
    id: Category;
    label: string;
    icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
}[] = [{ id: "api-keys", label: "API Keys", icon: KeyIcon }];

function SettingsPage() {
    const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const [activeCategory, setActiveCategory] = useState<Category>("api-keys");
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
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-dark-200">Loading settings...</p>
            </div>
        );
    }

    return (
        <div className="flex h-full overflow-hidden">
            <aside className="flex w-56 shrink-0 flex-col border-r border-dark-600 px-3 py-6">
                <p className="mb-2 px-1 text-xs font-semibold uppercase text-dark-300">
                    Settings
                </p>
                <nav className="space-y-0.5">
                    {CATEGORIES.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveCategory(id)}
                            className={cn(
                                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                                activeCategory === id
                                    ? "bg-dark-700 text-white"
                                    : "text-dark-200 hover:bg-dark-700 hover:text-white"
                            )}
                        >
                            <Icon
                                className="size-4 shrink-0"
                                weight="regular"
                            />
                            {label}
                        </button>
                    ))}
                </nav>
            </aside>

            <div className="flex-1 overflow-y-auto px-8 py-8">
                {activeCategory === "api-keys" && (
                    <div className="max-w-2xl mx-auto">
                        <h1 className="text-lg font-semibold text-white">
                            API Keys
                        </h1>
                        <p className="mt-1 text-sm text-dark-200">
                            Connect external services by providing your API
                            keys.
                        </p>

                        <div className="mt-6 rounded-md border border-dark-600 bg-dark-900 overflow-hidden">
                            <div className="flex items-center gap-3 border-b border-dark-600 px-5 py-4">
                                <div className="flex size-8 items-center justify-center rounded-md bg-dark-700">
                                    <KeyIcon
                                        className="size-4 text-dark-200"
                                        weight="bold"
                                    />
                                </div>
                                <div>
                                    <h2 className="text-sm font-medium text-white">
                                        OpenRouter
                                    </h2>
                                    <p className="text-xs text-dark-200">
                                        Required to use models via OpenRouter
                                    </p>
                                </div>
                                <div className="ml-auto flex items-center gap-1.5">
                                    {settings.hasOpenRouterApiKey ? (
                                        <>
                                            <CheckCircleIcon
                                                className="size-4 text-emerald-400"
                                                weight="fill"
                                            />
                                            <span className="text-xs text-emerald-400">
                                                Configured
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <XCircleIcon
                                                className="size-4 text-dark-200"
                                                weight="fill"
                                            />
                                            <span className="text-xs text-dark-200">
                                                Not configured
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="p-4">
                                {settings.openRouterApiKeyPreview ? (
                                    <div className="mb-2 flex items-center gap-2.5 rounded-md bg-dark-700 px-3 py-2.5">
                                        <ShieldCheckIcon className="size-4 shrink-0 text-dark-200" />
                                        <span className="flex-1 text-sm text-dark-100">
                                            {settings.openRouterApiKeyPreview}
                                        </span>
                                        {updatedAtLabel ? (
                                            <span className="text-xs text-dark-200">
                                                Updated {updatedAtLabel}
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}

                                <form
                                    className="space-y-2"
                                    onSubmit={handleSave}
                                >
                                    <label className="block space-y-2">
                                        <span className="text-xs font-semibold text-dark-200">
                                            {settings.hasOpenRouterApiKey
                                                ? "Replace key"
                                                : "Add key"}
                                        </span>
                                        <Input
                                            value={apiKey}
                                            onChange={(event) =>
                                                setApiKey(event.target.value)
                                            }
                                            placeholder="sk-or-v1-..."
                                            autoComplete="off"
                                            leftSection={
                                                <ShieldCheckIcon className="size-4 text-dark-200" />
                                            }
                                            className="bg-dark-700"
                                            disabled={
                                                isLoadingSettings ||
                                                isSaving ||
                                                isRemoving
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
                                            {isSaving
                                                ? "Saving..."
                                                : "Save key"}
                                        </Button>

                                        {settings.hasOpenRouterApiKey ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={handleRemove}
                                                disabled={
                                                    isLoadingSettings ||
                                                    isSaving ||
                                                    isRemoving
                                                }
                                                className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                            >
                                                {isRemoving
                                                    ? "Removing..."
                                                    : "Remove key"}
                                            </Button>
                                        ) : null}
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
