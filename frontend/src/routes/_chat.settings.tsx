import { useEffect, useMemo, useState } from "react";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import {
    ShieldCheckIcon,
    KeyIcon,
    CheckCircleIcon,
    XCircleIcon,
    type IconWeight
} from "@phosphor-icons/react";
import { OpenRouter, OpenAI, Anthropic, Google, Moonshot } from "@lobehub/icons";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";
import { useChat } from "@/features/chat/chat-context";
import { settingsApi } from "@/features/settings/api";
import type {
    ProviderType,
    ProviderKeyStatus,
    UserSettingsSummary
} from "@/features/settings/types";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

const defaultSettings: UserSettingsSummary = {
    providers: {
        openrouter: { configured: false, preview: null, updatedAt: null },
        openai: { configured: false, preview: null, updatedAt: null },
        anthropic: { configured: false, preview: null, updatedAt: null },
        google: { configured: false, preview: null, updatedAt: null },
        kimi: { configured: false, preview: null, updatedAt: null }
    }
};

interface ProviderConfig {
    id: ProviderType;
    label: string;
    description: string;
    placeholder: string;
    icon: React.ComponentType<{ className?: string }>;
}

const PROVIDERS: ProviderConfig[] = [
    {
        id: "openrouter",
        label: "OpenRouter",
        description: "Access hundreds of models through a single API",
        placeholder: "sk-or-v1-...",
        icon: OpenRouter
    },
    {
        id: "openai",
        label: "OpenAI",
        description: "GPT-4o, o3 and other OpenAI models",
        placeholder: "sk-...",
        icon: OpenAI
    },
    {
        id: "anthropic",
        label: "Anthropic",
        description: "Claude Sonnet, Opus and Haiku models",
        placeholder: "sk-ant-...",
        icon: Anthropic
    },
    {
        id: "google",
        label: "Google",
        description: "Gemini Pro, Flash and other Google models",
        placeholder: "AIza...",
        icon: Google
    },
    {
        id: "kimi",
        label: "Kimi",
        description: "Kimi Code models through Kimi's coding API",
        placeholder: "sk-kimi-...",
        icon: Moonshot
    }
];

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

function ProviderKeyCard({
    config,
    status,
    onSave,
    onRemove,
    globalBusy
}: {
    config: ProviderConfig;
    status: ProviderKeyStatus;
    onSave: (provider: ProviderType, apiKey: string) => Promise<void>;
    onRemove: (provider: ProviderType) => Promise<void>;
    globalBusy: boolean;
}) {
    const [apiKey, setApiKey] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const updatedAtLabel = useMemo(() => {
        if (!status.updatedAt) return null;
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(new Date(status.updatedAt));
    }, [status.updatedAt]);

    const Icon = config.icon;
    const busy = isSaving || isRemoving || globalBusy;

    async function handleSave(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setNotice(null);

        const trimmed = apiKey.trim();
        if (!trimmed) {
            setError(`${config.label} API key is required.`);
            return;
        }

        setIsSaving(true);
        try {
            await onSave(config.id, trimmed);
            setApiKey("");
            setNotice(`${config.label} API key saved.`);
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setIsSaving(false);
        }
    }

    async function handleRemove() {
        setError(null);
        setNotice(null);
        setIsRemoving(true);
        try {
            await onRemove(config.id);
            setNotice(`${config.label} API key removed.`);
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setIsRemoving(false);
        }
    }

    return (
        <div className="rounded-md border border-dark-600 bg-dark-900 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-dark-600 px-5 py-4">
                <div className="flex size-8 items-center justify-center rounded-md bg-dark-700">
                    <Icon className="size-4 text-dark-200" />
                </div>
                <div>
                    <h2 className="text-sm font-medium text-white">
                        {config.label}
                    </h2>
                    <p className="text-xs text-dark-200">{config.description}</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                    {status.configured ? (
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
                {status.preview ? (
                    <div className="mb-2 flex items-center gap-2.5 rounded-md bg-dark-700 px-3 py-2.5">
                        <ShieldCheckIcon className="size-4 shrink-0 text-dark-200" />
                        <span className="flex-1 text-sm text-dark-100">
                            {status.preview}
                        </span>
                        {updatedAtLabel ? (
                            <span className="text-xs text-dark-200">
                                Updated {updatedAtLabel}
                            </span>
                        ) : null}
                    </div>
                ) : null}

                <form className="space-y-2" onSubmit={handleSave}>
                    <label className="block space-y-2">
                        <span className="text-xs font-semibold text-dark-200">
                            {status.configured ? "Replace key" : "Add key"}
                        </span>
                        <Input
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={config.placeholder}
                            autoComplete="off"
                            leftSection={
                                <ShieldCheckIcon className="size-4 text-dark-200" />
                            }
                            className="bg-dark-700"
                            disabled={busy}
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
                            disabled={busy || !apiKey.trim()}
                        >
                            {isSaving ? "Saving..." : "Save key"}
                        </Button>

                        {status.configured ? (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={handleRemove}
                                disabled={busy}
                                className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            >
                                {isRemoving ? "Removing..." : "Remove key"}
                            </Button>
                        ) : null}
                    </div>
                </form>
            </div>
        </div>
    );
}

function SettingsPage() {
    const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const { loadModels } = useChat();
    const [activeCategory, setActiveCategory] = useState<Category>("api-keys");
    const [settings, setSettings] =
        useState<UserSettingsSummary>(defaultSettings);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);

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

    async function handleSaveKey(provider: ProviderType, apiKey: string) {
        const response = await settingsApi.updateProviderApiKey(
            provider,
            apiKey
        );
        setSettings(response.settings);
        void loadModels().catch(() => undefined);
    }

    async function handleRemoveKey(provider: ProviderType) {
        const response = await settingsApi.removeProviderApiKey(provider);
        setSettings(response.settings);
        void loadModels().catch(() => undefined);
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
                    {CATEGORIES.map(({ id, label, icon: CatIcon }) => (
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
                            <CatIcon
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
                            Connect AI providers by adding your API keys. Keys
                            are encrypted and stored securely.
                        </p>

                        {error ? (
                            <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {error}
                            </div>
                        ) : null}

                        <div className="mt-6 flex flex-col gap-4">
                            {PROVIDERS.map((config) => (
                                <ProviderKeyCard
                                    key={config.id}
                                    config={config}
                                    status={settings.providers[config.id]}
                                    onSave={handleSaveKey}
                                    onRemove={handleRemoveKey}
                                    globalBusy={isLoadingSettings}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
