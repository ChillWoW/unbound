import {
    Input,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Switch,
    Tooltip
} from "@/components/ui";
import type { ChatModel } from "../types";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    MagnifyingGlassIcon,
    ChatTextIcon,
    ImageIcon,
    MicrophoneIcon,
    FilmStripIcon,
    FileIcon,
    InfoIcon,
    BrainIcon,
    FunnelIcon
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import {
    Arcee,
    Qwen,
    Stepfun,
    Minimax,
    Moonshot,
    XAI,
    OpenAI,
    Google,
    Anthropic,
    ZAI
} from "@lobehub/icons";

const ICONS: Record<string, React.ComponentType<any>> = {
    qwen: Qwen,
    stepfun: Stepfun,
    "arcee-ai": Arcee,
    minimax: Minimax,
    moonshot: Moonshot,
    "x-ai": XAI,
    openai: OpenAI,
    google: Google,
    anthropic: Anthropic,
    zai: ZAI
};

function formatPricing(raw: string): string {
    const perToken = parseFloat(raw);
    if (isNaN(perToken)) return raw;
    if (perToken === 0) return "Free";
    const perMillion = perToken * 1_000_000;
    return `$${perMillion % 1 === 0 ? perMillion.toFixed(0) : perMillion.toPrecision(3)} / 1M tokens`;
}

function formatContextLength(tokens: number): string {
    if (tokens >= 1_000_000)
        return `${(tokens / 1_000_000).toFixed(0)}M tokens`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K tokens`;
    return `${tokens} tokens`;
}

const MODALITY_ICONS: Record<
    string,
    { icon: React.ComponentType<any>; label: string }
> = {
    text: { icon: ChatTextIcon, label: "Text" },
    image: { icon: ImageIcon, label: "Image" },
    audio: { icon: MicrophoneIcon, label: "Audio" },
    video: { icon: FilmStripIcon, label: "Video" },
    file: { icon: FileIcon, label: "File" }
};

function formatProviderName(provider: string): string {
    return provider
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ");
}

function ModalityBadge({ modality }: { modality: string }) {
    const entry = MODALITY_ICONS[modality.toLowerCase()];
    if (!entry)
        return <span className="capitalize text-dark-100">{modality}</span>;

    const Icon = entry.icon;

    return (
        <div className="flex items-center gap-1.5 rounded-md bg-dark-700 border border-dark-500 px-2 py-1">
            <Icon className="size-3 text-dark-100" />
            <span className="text-[11px] font-medium text-dark-100">
                {entry.label}
            </span>
        </div>
    );
}

function InfoRow({
    label,
    children
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-6">
            <span className="text-[11px] text-dark-200">{label}</span>
            <span className="text-[11px] font-medium tabular-nums text-dark-50">
                {children}
            </span>
        </div>
    );
}

function ModelInfoButton({ model }: { model: ChatModel }) {
    const hasInfo =
        model.description ||
        model.contextLength ||
        model.promptPricing ||
        model.completionPricing ||
        model.inputModalities.length > 0;

    if (!hasInfo) return null;

    const hasPricing = model.promptPricing || model.completionPricing;
    const ProviderIcon = ICONS[model.provider];

    return (
        <Popover>
            <PopoverTrigger
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-dark-200 transition-colors hover:bg-dark-500 hover:text-white"
                onClick={(e) => e.stopPropagation()}
            >
                <InfoIcon className="size-3.5" />
            </PopoverTrigger>

            <PopoverContent
                side="right"
                align="start"
                sideOffset={20}
                className="min-w-[240px] p-0"
            >
                <div className="flex flex-col">
                    <div className="flex flex-col gap-1 px-3 pt-3 pb-2">
                        <div className="flex items-center gap-2">
                            {ProviderIcon && (
                                <ProviderIcon
                                    className="size-3.5 shrink-0 opacity-60"
                                    title=""
                                />
                            )}
                            <h3 className="text-xs font-semibold text-dark-50 leading-tight">
                                {model.name}
                            </h3>
                        </div>

                        {model.description && (
                            <p className="text-[11px] leading-relaxed text-dark-200">
                                {model.description}
                            </p>
                        )}
                    </div>

                    {(model.contextLength || hasPricing) && (
                        <div className="flex flex-col gap-1 border-t border-dark-600 px-3 py-2">
                            {model.contextLength && (
                                <InfoRow label="Context">
                                    {formatContextLength(model.contextLength)}
                                </InfoRow>
                            )}

                            {model.promptPricing && (
                                <InfoRow label="Prompt">
                                    {formatPricing(model.promptPricing)}
                                </InfoRow>
                            )}

                            {model.completionPricing && (
                                <InfoRow label="Completion">
                                    {formatPricing(model.completionPricing)}
                                </InfoRow>
                            )}
                        </div>
                    )}

                    {model.inputModalities.length > 0 && (
                        <div className="flex flex-col gap-1 border-t border-dark-600 px-3 py-2">
                            <span className="text-[11px] text-dark-200">
                                Input modalities
                            </span>
                            <div className="flex flex-wrap gap-1">
                                {model.inputModalities.map((m) => (
                                    <ModalityBadge key={m} modality={m} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function ModelSelector({
    selectedModelId,
    models,
    onModelSelected,
    disabled = false,
    isThinkingEnabled = false,
    onThinkingChange
}: {
    selectedModelId: string | null;
    models: ChatModel[];
    onModelSelected: (model: ChatModel) => void;
    disabled?: boolean;
    isThinkingEnabled?: boolean;
    onThinkingChange?: (enabled: boolean) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [activeProvider, setActiveProvider] = useState<string | null>(null);
    const [selectedModalities, setSelectedModalities] = useState<string[]>([]);

    const modelName = useMemo(() => {
        if (!selectedModelId) return "Select a model";
        return models.find((model) => model.id === selectedModelId)?.name;
    }, [selectedModelId, models]);

    const ModelIcon = useMemo(() => {
        if (!selectedModelId) return null;
        return ICONS[
            models.find((model) => model.id === selectedModelId)?.provider ?? ""
        ];
    }, [selectedModelId, models]);

    const providers = useMemo(
        () =>
            Array.from(new Set(models.map((model) => model.provider))).sort(
                (a, b) =>
                    formatProviderName(a).localeCompare(formatProviderName(b))
            ),
        [models]
    );

    const allModalities = useMemo(() => {
        const priority = ["text", "image", "audio", "video", "file"];
        const seen = new Set(
            models.flatMap((model) =>
                model.inputModalities.map((modality) => modality.toLowerCase())
            )
        );

        return Array.from(seen).sort((a, b) => {
            const aIndex = priority.indexOf(a);
            const bIndex = priority.indexOf(b);

            if (aIndex !== -1 || bIndex !== -1) {
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            }

            return a.localeCompare(b);
        });
    }, [models]);

    const modelMatchesModalities = useCallback(
        (model: ChatModel) => {
            if (selectedModalities.length === 0) return true;
            const modelModalities = model.inputModalities.map((m) =>
                m.toLowerCase()
            );
            return selectedModalities.some((modality) =>
                modelModalities.includes(modality)
            );
        },
        [selectedModalities]
    );

    const providerEnabledMap = useMemo(() => {
        const map: Record<string, boolean> = {};
        for (const provider of providers) {
            map[provider] = models
                .filter((model) => model.provider === provider)
                .some((model) => modelMatchesModalities(model));
        }
        return map;
    }, [providers, models, modelMatchesModalities]);

    const availableProviders = useMemo(
        () => providers.filter((provider) => providerEnabledMap[provider]),
        [providers, providerEnabledMap]
    );

    useEffect(() => {
        if (providers.length === 0 || availableProviders.length === 0) {
            setActiveProvider(null);
            return;
        }

        setActiveProvider((current) => {
            if (current && availableProviders.includes(current)) return current;

            const selectedProvider = selectedModelId
                ? models.find((model) => model.id === selectedModelId)?.provider
                : null;

            if (
                selectedProvider &&
                availableProviders.includes(selectedProvider)
            ) {
                return selectedProvider;
            }

            return availableProviders[0];
        });
    }, [providers, availableProviders, selectedModelId, models]);

    const filteredModels = useMemo(() => {
        const scopedModels = activeProvider
            ? models.filter((model) => model.provider === activeProvider)
            : models;

        const modalityFilteredModels = scopedModels.filter(
            modelMatchesModalities
        );

        if (!search.trim()) return modalityFilteredModels;
        const q = search.toLowerCase();
        return modalityFilteredModels.filter((m) =>
            m.name.toLowerCase().includes(q)
        );
    }, [models, search, activeProvider, modelMatchesModalities]);

    const toggleModality = (modality: string) => {
        setSelectedModalities((current) =>
            current.includes(modality)
                ? current.filter((item) => item !== modality)
                : [...current, modality]
        );
    };

    return (
        <Popover
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
            }}
        >
            <PopoverTrigger
                className={cn(
                    "inline-flex h-8 max-w-48 cursor-pointer items-center gap-2 rounded-md px-3 text-xs outline-none transition-colors hover:bg-dark-600 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
                    selectedModelId ? "text-dark-50" : "text-dark-100"
                )}
                disabled={disabled}
            >
                {ModelIcon && (
                    <ModelIcon className="size-4 opacity-70" title="" />
                )}
                <span className="truncate">{modelName}</span>
            </PopoverTrigger>

            <PopoverContent
                side="top"
                className="flex h-96 w-[28rem] flex-col overflow-hidden p-0"
            >
                <div className="flex min-h-0 flex-1">
                    <div className="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden hide-scrollbar border-r border-dark-600 bg-dark-950 p-2">
                        {providers.map((provider) => {
                            const ProviderIcon = ICONS[provider];
                            const isActive = provider === activeProvider;
                            const isEnabled = providerEnabledMap[provider];

                            return (
                                <Tooltip
                                    key={provider}
                                    content={`${formatProviderName(provider)}${isEnabled ? "" : " (No matching models)"}`}
                                    side="right"
                                    delay={300}
                                >
                                    <button
                                        type="button"
                                        disabled={!isEnabled}
                                        className={cn(
                                            "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
                                            isActive
                                                ? "bg-dark-800 text-white"
                                                : "text-dark-200 hover:bg-dark-800 hover:text-white",
                                            !isEnabled &&
                                                "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-dark-200"
                                        )}
                                        onClick={() =>
                                            setActiveProvider(provider)
                                        }
                                    >
                                        <ProviderIcon
                                            className="size-4"
                                            title=""
                                        />
                                    </button>
                                </Tooltip>
                            );
                        })}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                        <Input
                            leftSection={
                                <MagnifyingGlassIcon
                                    className="size-4"
                                    weight="bold"
                                />
                            }
                            rightSection={
                                allModalities.length > 0 ? (
                                    <Popover>
                                        <PopoverTrigger
                                            className={cn(
                                                "inline-flex size-6 items-center justify-center rounded-md transition-colors hover:bg-dark-600",
                                                selectedModalities.length > 0
                                                    ? "text-dark-50"
                                                    : "text-dark-200 hover:text-dark-50"
                                            )}
                                        >
                                            <FunnelIcon
                                                className="size-4"
                                                weight={
                                                    selectedModalities.length >
                                                    0
                                                        ? "fill"
                                                        : "bold"
                                                }
                                            />
                                        </PopoverTrigger>

                                        <PopoverContent
                                            side="right"
                                            sideOffset={12}
                                            className="w-52 p-0"
                                        >
                                            <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
                                                <span className="text-[11px] font-semibold text-dark-200">
                                                    Modality
                                                </span>
                                                {selectedModalities.length >
                                                    0 && (
                                                    <button
                                                        type="button"
                                                        className="text-[11px] text-dark-200 transition-colors hover:text-white"
                                                        onClick={() =>
                                                            setSelectedModalities(
                                                                []
                                                            )
                                                        }
                                                    >
                                                        Clear all
                                                    </button>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-1 px-1.5 pb-1.5">
                                                {allModalities.map(
                                                    (modality) => {
                                                        const entry =
                                                            MODALITY_ICONS[
                                                                modality
                                                            ];
                                                        const Icon =
                                                            entry?.icon;
                                                        const label =
                                                            entry?.label ??
                                                            modality;
                                                        const isSelected =
                                                            selectedModalities.includes(
                                                                modality
                                                            );

                                                        return (
                                                            <button
                                                                key={modality}
                                                                type="button"
                                                                className={cn(
                                                                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                                                                    isSelected
                                                                        ? "bg-dark-700 text-white"
                                                                        : "text-dark-100 hover:bg-dark-700 hover:text-white"
                                                                )}
                                                                onClick={() =>
                                                                    toggleModality(
                                                                        modality
                                                                    )
                                                                }
                                                            >
                                                                {Icon && (
                                                                    <Icon
                                                                        className="size-3.5 shrink-0"
                                                                        weight={
                                                                            isSelected
                                                                                ? "fill"
                                                                                : "regular"
                                                                        }
                                                                    />
                                                                )}
                                                                <span className="capitalize">
                                                                    {label}
                                                                </span>
                                                            </button>
                                                        );
                                                    }
                                                )}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                ) : null
                            }
                            placeholder="Search models"
                            className="rounded-none border-b border-dark-600 py-1"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
                            {filteredModels.length === 0 && (
                                <div className="flex h-full items-center justify-center">
                                    <p className="text-center text-xs text-dark-200">
                                        No models found
                                    </p>
                                </div>
                            )}

                            <div className="flex flex-col gap-0.5">
                                {filteredModels.map((model) => {
                                    const ProviderIcon = ICONS[model.provider];

                                    return (
                                        <div
                                            key={model.id}
                                            className={cn(
                                                "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-xs text-dark-100 transition-colors hover:bg-dark-600 hover:text-white",
                                                model.id === selectedModelId &&
                                                    "bg-dark-600 text-white"
                                            )}
                                            onClick={() => {
                                                onModelSelected(model);
                                                setOpen(false);
                                            }}
                                        >
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                                {ProviderIcon && (
                                                    <ProviderIcon
                                                        className="size-3.5 shrink-0 opacity-50"
                                                        title=""
                                                    />
                                                )}
                                                <span className="min-w-0 flex-1 truncate text-left">
                                                    {model.name}
                                                </span>
                                            </div>

                                            {model.free && (
                                                <div className="shrink-0 rounded-md bg-green-500/15 px-2 py-0.5 text-[11px] text-green-100">
                                                    Free
                                                </div>
                                            )}

                                            <ModelInfoButton model={model} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {onThinkingChange && (
                    <button
                        type="button"
                        className={cn(
                            "flex w-full shrink-0 items-center gap-2 border-t border-dark-600 px-3 py-2 text-xs transition-colors hover:bg-dark-700",
                            isThinkingEnabled ? "text-white" : "text-dark-100"
                        )}
                        onClick={() => onThinkingChange(!isThinkingEnabled)}
                    >
                        <BrainIcon
                            className="size-4"
                            weight={isThinkingEnabled ? "fill" : "bold"}
                        />
                        <span>Thinking</span>

                        <Switch
                            checked={isThinkingEnabled}
                            onCheckedChange={onThinkingChange}
                            className="ml-auto bg-dark-900"
                            size="sm"
                        />
                    </button>
                )}
            </PopoverContent>
        </Popover>
    );
}
