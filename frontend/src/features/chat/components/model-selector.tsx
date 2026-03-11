import {
    Popover,
    PopoverContent,
    PopoverTrigger,
    Tooltip
} from "@/components/ui";
import type { ChatModel, ProviderType } from "../types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    MagnifyingGlassIcon,
    ChatTextIcon,
    ImageIcon,
    MicrophoneIcon,
    FilmStripIcon,
    FileIcon,
    InfoIcon,
    FunnelIcon,
    CheckIcon,
    CaretUpDownIcon
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
    ZAI,
    OpenRouter
} from "@lobehub/icons";

const ICONS: Record<string, React.ComponentType<any>> = {
    qwen: Qwen,
    stepfun: Stepfun,
    "arcee-ai": Arcee,
    minimax: Minimax,
    moonshot: Moonshot,
    kimi: Moonshot,
    "x-ai": XAI,
    openai: OpenAI,
    google: Google,
    anthropic: Anthropic,
    zai: ZAI,
    openrouter: OpenRouter
};

const PROVIDER_ALIASES: Record<string, string> = {
    moonshot: "kimi"
};

const ALWAYS_VISIBLE_PROVIDERS = ["openai", "anthropic", "google", "kimi"];

const DIRECT_API_PROVIDERS = new Set<string>([
    "openai",
    "anthropic",
    "google",
    "kimi"
]);

const THINKING_ONLY_MODEL_IDS = new Set(["kimi-k2-thinking"]);

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
        return <span className="capitalize text-dark-200">{modality}</span>;
    const Icon = entry.icon;
    return (
        <div className="flex items-center gap-1.5 rounded-md border border-dark-600 bg-dark-700 px-2 py-1">
            <Icon className="size-3 text-dark-200" />
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
            <span className="text-[11px] text-dark-300">{label}</span>
            <span className="text-[11px] font-medium tabular-nums text-dark-100">
                {children}
            </span>
        </div>
    );
}

function ModelInfoButton({
    model,
    selected
}: {
    model: ChatModel;
    selected: boolean;
}) {
    const hasInfo =
        model.description ||
        model.contextLength ||
        model.maxOutputTokens ||
        model.promptPricing ||
        model.completionPricing ||
        model.inputModalities.length > 0;

    if (!hasInfo) return null;

    const hasPricing = model.promptPricing || model.completionPricing;
    const ProviderIcon = ICONS[model.provider];

    return (
        <Popover>
            <PopoverTrigger
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-dark-300 opacity-0 transition-colors group-hover:opacity-100 hover:bg-dark-600 hover:text-dark-100"
                onClick={(e) => e.stopPropagation()}
            >
                <InfoIcon className="size-3.5" />
            </PopoverTrigger>

            <PopoverContent
                side="right"
                align="start"
                sideOffset={selected ? 44 : 24}
                className="min-w-[240px] p-0 bg-dark-850 border-dark-500"
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
                            <h3 className="text-xs font-semibold leading-tight text-dark-50">
                                {model.name}
                            </h3>
                        </div>
                        {model.description && (
                            <p className="text-[11px] leading-relaxed text-dark-300">
                                {model.description}
                            </p>
                        )}
                    </div>

                    {(model.contextLength || hasPricing) && (
                        <div className="flex flex-col gap-1 border-t border-dark-500 px-3 py-2">
                            {model.contextLength && (
                                <InfoRow label="Context">
                                    {formatContextLength(model.contextLength)}
                                </InfoRow>
                            )}
                            {model.maxOutputTokens && (
                                <InfoRow label="Max output">
                                    {formatContextLength(model.maxOutputTokens)}
                                </InfoRow>
                            )}
                            {model.promptPricing && (
                                <InfoRow label="Input">
                                    {formatPricing(model.promptPricing)}
                                </InfoRow>
                            )}
                            {model.completionPricing && (
                                <InfoRow label="Output">
                                    {formatPricing(model.completionPricing)}
                                </InfoRow>
                            )}
                        </div>
                    )}

                    {model.inputModalities.length > 0 && (
                        <div className="flex flex-col gap-1.5 border-t border-dark-500 px-3 py-2">
                            <span className="text-[11px] text-dark-300">
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
    configuredProviders = [],
    onModelSelected,
    disabled = false,
    isThinkingEnabled = false
}: {
    selectedModelId: string | null;
    models: ChatModel[];
    configuredProviders?: ProviderType[];
    onModelSelected: (model: ChatModel) => void;
    disabled?: boolean;
    isThinkingEnabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedModalities, setSelectedModalities] = useState<string[]>([]);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const frame = requestAnimationFrame(() => {
            listRef.current
                ?.querySelector<HTMLElement>("[data-selected='true']")
                ?.scrollIntoView({ block: "center" });
        });
        return () => cancelAnimationFrame(frame);
    }, [open]);

    const noProvidersConfigured =
        models.length === 0 && configuredProviders.length === 0;

    const selectedModel = useMemo(
        () => models.find((m) => m.id === selectedModelId),
        [selectedModelId, models]
    );

    const ModelIcon = useMemo(() => {
        if (!selectedModelId) return null;
        const model = models.find((m) => m.id === selectedModelId);
        if (!model) return null;
        if (model.source === "openrouter") return OpenRouter;
        return ICONS[model.provider] ?? null;
    }, [selectedModelId, models]);

    const configuredProviderSet = useMemo(
        () => new Set(configuredProviders),
        [configuredProviders]
    );

    const allModalities = useMemo(() => {
        const priority = ["text", "image", "audio", "video", "file"];
        const seen = new Set(
            models.flatMap((m) =>
                m.inputModalities.map((mod) => mod.toLowerCase())
            )
        );
        return Array.from(seen).sort((a, b) => {
            const ai = priority.indexOf(a);
            const bi = priority.indexOf(b);
            if (ai !== -1 || bi !== -1) {
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
            }
            return a.localeCompare(b);
        });
    }, [models]);

    const modelMatchesModalities = useCallback(
        (model: ChatModel) => {
            if (selectedModalities.length === 0) return true;
            const modelMods = model.inputModalities.map((m) => m.toLowerCase());
            return selectedModalities.some((mod) => modelMods.includes(mod));
        },
        [selectedModalities]
    );

    const isProviderConfigured = useCallback(
        (provider: string) => {
            const hasModels = models.some(
                (m) => (PROVIDER_ALIASES[m.provider] ?? m.provider) === provider
            );
            if (hasModels) return true;
            if (DIRECT_API_PROVIDERS.has(provider))
                return configuredProviderSet.has(provider as ProviderType);
            return configuredProviderSet.has("openrouter");
        },
        [models, configuredProviderSet]
    );

    // Grouped + filtered models — OpenRouter models get their own group,
    // direct-API models group by provider.
    const groups = useMemo(() => {
        const q = search.trim().toLowerCase();

        // Collect group keys in a stable order: direct providers first, openrouter last
        const groupKeys = new Set<string>();
        for (const p of ALWAYS_VISIBLE_PROVIDERS) groupKeys.add(p);
        for (const m of models) {
            if (m.source === "openrouter") {
                groupKeys.add("openrouter");
            } else {
                groupKeys.add(PROVIDER_ALIASES[m.provider] ?? m.provider);
            }
        }
        const ordered = Array.from(groupKeys).sort((a, b) => {
            if (a === "openrouter") return 1;
            if (b === "openrouter") return -1;
            const aDirect = DIRECT_API_PROVIDERS.has(a);
            const bDirect = DIRECT_API_PROVIDERS.has(b);
            if (aDirect !== bDirect) return aDirect ? -1 : 1;
            return formatProviderName(a).localeCompare(formatProviderName(b));
        });

        return ordered
            .map((key) => {
                const groupModels = models
                    .filter((m) =>
                        key === "openrouter"
                            ? m.source === "openrouter"
                            : m.source !== "openrouter" &&
                              (PROVIDER_ALIASES[m.provider] ?? m.provider) ===
                                  key
                    )
                    .filter(modelMatchesModalities)
                    .filter((m) =>
                        q ? m.name.toLowerCase().includes(q) : true
                    );
                return { key, models: groupModels };
            })
            .filter((g) => g.models.length > 0);
    }, [models, search, modelMatchesModalities]);

    const toggleModality = (modality: string) => {
        setSelectedModalities((cur) =>
            cur.includes(modality)
                ? cur.filter((m) => m !== modality)
                : [...cur, modality]
        );
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) setSearch("");
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger
                disabled={disabled}
                className={cn(
                    "inline-flex h-8 max-w-80 cursor-pointer items-center gap-2 rounded-md px-2.5 text-xs outline-none transition-colors",
                    "text-dark-100 hover:bg-dark-700 hover:text-dark-50",
                    open && "bg-dark-700 text-dark-100",
                    disabled && "pointer-events-none opacity-50"
                )}
            >
                {ModelIcon && (
                    <ModelIcon className="size-4 shrink-0" title="" />
                )}
                <span className="truncate">
                    {selectedModel?.name ??
                        (noProvidersConfigured
                            ? "No providers configured"
                            : "Select a model")}
                </span>
                {selectedModel?.free && (
                    <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        Free
                    </span>
                )}
                <CaretUpDownIcon className="size-3 shrink-0" />
            </PopoverTrigger>

            <PopoverContent
                side="top"
                align="start"
                sideOffset={6}
                className="bg-dark-850 border-dark-500 flex w-[42rem] min-h-[400px] flex-col overflow-hidden p-0"
            >
                {/* Search + filter row */}
                <div className="flex shrink-0 items-center gap-2 border-b border-dark-500 px-2.5">
                    <MagnifyingGlassIcon
                        className="size-4 shrink-0 text-dark-300"
                        weight="bold"
                    />
                    <input
                        autoFocus
                        className="h-9 flex-1 bg-transparent text-sm text-dark-50 placeholder-dark-300 outline-none"
                        placeholder="Search models…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    {allModalities.length > 0 && (
                        <Popover>
                            <PopoverTrigger
                                className={cn(
                                    "inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                                    selectedModalities.length > 0
                                        ? "bg-dark-600 text-dark-100"
                                        : "text-dark-300 hover:bg-dark-700 hover:text-dark-100"
                                )}
                            >
                                <FunnelIcon
                                    className="size-3.5"
                                    weight={
                                        selectedModalities.length > 0
                                            ? "fill"
                                            : "bold"
                                    }
                                />
                            </PopoverTrigger>
                            <PopoverContent
                                side="right"
                                sideOffset={12}
                                className="p-0 bg-dark-850 border-dark-500"
                            >
                                <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                                    <span className="text-[11px] font-semibold text-dark-300">
                                        Modality
                                    </span>
                                    {selectedModalities.length > 0 && (
                                        <button
                                            type="button"
                                            className="text-[11px] text-dark-200 transition-colors hover:text-dark-50"
                                            onClick={() =>
                                                setSelectedModalities([])
                                            }
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-col gap-px px-1.5 pb-1.5">
                                    {allModalities.map((modality) => {
                                        const entry = MODALITY_ICONS[modality];
                                        const Icon = entry?.icon;
                                        const label = entry?.label ?? modality;
                                        const isSelected =
                                            selectedModalities.includes(
                                                modality
                                            );
                                        return (
                                            <button
                                                key={modality}
                                                type="button"
                                                className={cn(
                                                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                                                    isSelected
                                                        ? "bg-dark-700 text-dark-50"
                                                        : "text-dark-200 hover:bg-dark-700 hover:text-dark-50"
                                                )}
                                                onClick={() =>
                                                    toggleModality(modality)
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
                                                <span className="flex-1 capitalize text-left">
                                                    {label}
                                                </span>
                                                {isSelected && (
                                                    <CheckIcon
                                                        className="size-3 shrink-0"
                                                        weight="bold"
                                                    />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}
                </div>

                {/* Model list */}
                <div
                    ref={listRef}
                    className="min-h-0 flex-1 overflow-y-auto"
                    style={{ maxHeight: "360px" }}
                >
                    {groups.length === 0 ? (
                        <div className="flex h-24 items-center justify-center">
                            <p className="text-xs text-dark-300">
                                {search
                                    ? `No results for "${search}"`
                                    : "No models available"}
                            </p>
                        </div>
                    ) : (
                        <div className="p-1">
                            {groups.map(({ key, models: groupModels }, gi) => {
                                const ProviderIcon = ICONS[key];
                                const configured =
                                    key === "openrouter"
                                        ? configuredProviderSet.has(
                                              "openrouter"
                                          )
                                        : isProviderConfigured(key);

                                return (
                                    <div key={key}>
                                        {/* Provider header */}
                                        {(groups.length > 1 || !search) && (
                                            <div
                                                className={cn(
                                                    "flex items-center gap-2 px-2.5 py-1.5",
                                                    gi > 0 && "mt-1"
                                                )}
                                            >
                                                {ProviderIcon && (
                                                    <ProviderIcon
                                                        className="size-3 shrink-0 opacity-60"
                                                        title=""
                                                    />
                                                )}
                                                <span className="text-[10px] font-medium uppercase text-dark-200">
                                                    {formatProviderName(key)}
                                                </span>
                                                {!configured && (
                                                    <span className="text-[10px] text-dark-200">
                                                        — configure in Settings
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Models */}
                                        <div className="flex flex-col gap-px">
                                            {groupModels.map((model) => {
                                                const requiresThinking =
                                                    THINKING_ONLY_MODEL_IDS.has(
                                                        model.id
                                                    );
                                                const isDisabled =
                                                    requiresThinking &&
                                                    !isThinkingEnabled;
                                                const isSelected =
                                                    model.id ===
                                                        selectedModelId &&
                                                    model.source ===
                                                        selectedModel?.source;

                                                const ModelRowIcon =
                                                    model.source ===
                                                    "openrouter"
                                                        ? OpenRouter
                                                        : ICONS[model.provider];

                                                const row = (
                                                    <div
                                                        key={`${model.source}-${model.id}`}
                                                        data-selected={
                                                            isSelected ||
                                                            undefined
                                                        }
                                                        className={cn(
                                                            "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                                                            isDisabled
                                                                ? "cursor-not-allowed opacity-50"
                                                                : "cursor-pointer hover:bg-dark-700",
                                                            isSelected
                                                                ? "bg-dark-700 text-dark-50"
                                                                : "text-dark-100 hover:text-dark-50"
                                                        )}
                                                        onClick={() => {
                                                            if (isDisabled)
                                                                return;
                                                            onModelSelected(
                                                                model
                                                            );
                                                            setOpen(false);
                                                        }}
                                                        aria-disabled={
                                                            isDisabled
                                                        }
                                                    >
                                                        {ModelRowIcon ? (
                                                            <ModelRowIcon
                                                                className="size-3.5 shrink-0 opacity-60"
                                                                title=""
                                                            />
                                                        ) : (
                                                            <div className="size-3.5 shrink-0" />
                                                        )}
                                                        <span
                                                            className={cn(
                                                                "min-w-0 flex-1 truncate",
                                                                isSelected &&
                                                                    "font-medium"
                                                            )}
                                                        >
                                                            {model.name}
                                                        </span>

                                                        <div className="flex shrink-0 items-center gap-1.5">
                                                            {model.free && (
                                                                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                                                                    Free
                                                                </span>
                                                            )}
                                                            <ModelInfoButton
                                                                model={model}
                                                                selected={
                                                                    isSelected
                                                                }
                                                            />
                                                            {isSelected && (
                                                                <div className="size-3.5 shrink-0">
                                                                    <CheckIcon
                                                                        className="size-3.5 text-dark-300"
                                                                        weight="bold"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );

                                                if (!isDisabled) return row;

                                                return (
                                                    <Tooltip
                                                        key={`${model.source}-${model.id}`}
                                                        content="Enable Thinking to use this model"
                                                        side="right"
                                                    >
                                                        {row}
                                                    </Tooltip>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
