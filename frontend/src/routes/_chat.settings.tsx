import { useEffect, useState } from "react";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { ShieldCheckIcon, CheckCircleIcon } from "@phosphor-icons/react";
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
import { notify } from "@/lib/toast";

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

function ProviderRow({
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
    const [isBusy, setIsBusy] = useState(false);

    const Icon = config.icon;
    const busy = isBusy || globalBusy;

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const trimmed = apiKey.trim();

        setIsBusy(true);
        try {
            if (!trimmed) {
                if (!status.configured) return;
                await onRemove(config.id);
                setApiKey("");
                notify.success({
                    title: `${config.label} disconnected`,
                    description: "Provider API key removed."
                });
            } else {
                await onSave(config.id, trimmed);
                setApiKey("");
                notify.success({
                    title: `${config.label} connected`,
                    description: "Provider API key saved successfully."
                });
            }
        } catch (e) {
            notify.error({
                title: `Couldn't update ${config.label} key`,
                description: getErrorMessage(e)
            });
        } finally {
            setIsBusy(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-wrap items-center gap-4 py-4 border-b border-dark-700 last:border-b-0"
        >
            {/* Icon */}
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-dark-700">
                <Icon className="size-4 text-dark-100" />
            </div>

            {/* Title + description */}
            <div className="w-44 shrink-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white">
                        {config.label}
                    </span>
                    {status.configured && (
                        <CheckCircleIcon
                            className="size-3.5 text-emerald-400 shrink-0"
                            weight="fill"
                        />
                    )}
                </div>
                <p className="text-xs text-dark-300 leading-snug mt-0.5">
                    {config.description}
                </p>
            </div>

            {/* Input + save */}
            <div className="flex w-full md:flex-1 items-center gap-2 min-w-0">
                <Input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={status.preview ?? config.placeholder}
                    autoComplete="off"
                    leftSection={
                        <ShieldCheckIcon className="size-4 text-dark-300" />
                    }
                    className="flex-1 min-w-0"
                    disabled={busy}
                />
                <Button
                    type="submit"
                    variant="primary"
                    disabled={busy || (!apiKey.trim() && !status.configured)}
                >
                    {isBusy ? "Saving..." : "Save"}
                </Button>
            </div>
        </form>
    );
}

function SettingsPage() {
    const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const { loadModels } = useChat();
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
        const response = await settingsApi.updateProviderApiKey(provider, apiKey);
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
                <p className="text-sm text-dark-300">Loading settings...</p>
            </div>
        );
    }

    return (
        <div className="flex h-full overflow-y-auto">
            <div className="w-full max-w-2xl mx-auto px-4 py-8 sm:px-6">
                <div className="mb-6">
                    <h1 className="text-base font-semibold text-white">API Keys</h1>
                    <p className="mt-1 text-sm text-dark-300">
                        Connect AI providers with your API keys. Keys are encrypted and stored securely. Clear a key and save to remove it.
                    </p>
                </div>

                {error ? (
                    <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {error}
                    </div>
                ) : null}

                <div className="rounded-xl border border-dark-700 bg-dark-900 px-4 sm:px-6">
                    {PROVIDERS.map((config) => (
                        <ProviderRow
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
        </div>
    );
}
