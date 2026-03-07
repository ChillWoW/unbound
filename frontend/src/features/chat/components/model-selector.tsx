import {
    Input,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Tooltip
} from "@/components/ui";
import type { ChatModel } from "../types";
import { useMemo, useState } from "react";
import {
    MagnifyingGlassIcon,
    ChatTextIcon,
    ImageIcon,
    MicrophoneIcon,
    FilmStripIcon,
    FileIcon
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Arcee, Qwen, Stepfun } from "@lobehub/icons";

const ICONS: Record<string, React.ComponentType<any>> = {
    qwen: Qwen,
    stepfun: Stepfun,
    "arcee-ai": Arcee
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

function ModalityBadge({ modality }: { modality: string }) {
    const entry = MODALITY_ICONS[modality.toLowerCase()];
    if (!entry)
        return <span className="capitalize text-dark-100">{modality}</span>;

    const Icon = entry.icon;

    return (
        <div className="flex items-center gap-1.5 rounded-md bg-dark-600 px-2 py-1">
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
            <span className="text-[11px] font-medium tabular-nums text-dark-50">
                {children}
            </span>
        </div>
    );
}

function ModelInfoPopover({
    model,
    children
}: {
    model: ChatModel;
    children: React.ReactElement;
}) {
    const hasInfo =
        model.description ||
        model.contextLength ||
        model.promptPricing ||
        model.completionPricing ||
        model.inputModalities.length > 0;

    if (!hasInfo) return children;

    const hasPricing = model.promptPricing || model.completionPricing;
    const ProviderIcon = ICONS[model.provider];

    return (
        <Popover>
            <PopoverTrigger openOnHover>{children}</PopoverTrigger>

            <PopoverContent
                side="right"
                align="start"
                sideOffset={12}
                className="max-w-[240px] p-0"
            >
                <div className="flex flex-col">
                    <div className="flex flex-col gap-1 px-3 pt-3 pb-2">
                        <div className="flex items-center gap-2">
                            {ProviderIcon && (
                                <ProviderIcon className="size-3.5 shrink-0 opacity-60" />
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
                        <div className="flex flex-col gap-1.5 border-t border-dark-600 px-3 py-2.5">
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
                        <div className="flex flex-col gap-1.5 border-t border-dark-600 px-3 py-2.5">
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
    onModelSelected,
    disabled = false
}: {
    selectedModelId: string | null;
    models: ChatModel[];
    onModelSelected: (model: ChatModel) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

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

    const filteredModels = useMemo(() => {
        if (!search.trim()) return models;
        const q = search.toLowerCase();
        return models.filter(
            (m) =>
                m.name.toLowerCase().includes(q) ||
                m.provider.toLowerCase().includes(q)
        );
    }, [models, search]);

    return (
        <Tooltip content="Select a model">
            <Popover open={open} onOpenChange={setOpen}>
                <div className="w-full max-w-md">
                    <PopoverTrigger
                        className={cn(
                            "inline-flex h-8 max-w-48 cursor-pointer items-center gap-2 rounded-md px-3 text-xs outline-none transition-colors hover:bg-dark-700 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
                            selectedModelId ? "text-dark-50" : "text-dark-100"
                        )}
                        disabled={disabled}
                    >
                        {ModelIcon && (
                            <ModelIcon className="size-4 opacity-50" />
                        )}
                        <span className="truncate">{modelName}</span>
                    </PopoverTrigger>
                </div>

                <PopoverContent side="top" className="overflow-hidden p-0">
                    <div className="flex flex-col gap-1">
                        <Input
                            leftSection={
                                <MagnifyingGlassIcon
                                    className="size-4"
                                    weight="bold"
                                />
                            }
                            placeholder="Search models"
                            className="rounded-none border-b border-dark-600"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <div className="max-h-[300px] overflow-y-auto px-1 pb-1">
                            {filteredModels.length === 0 && (
                                <p className="py-4 text-center text-xs text-dark-300">
                                    No models found
                                </p>
                            )}

                            <div className="flex flex-col gap-1">
                                {filteredModels.map((model) => {
                                    const ProviderIcon = ICONS[model.provider];

                                    return (
                                        <ModelInfoPopover
                                            key={model.id}
                                            model={model}
                                        >
                                            <div
                                                className={cn(
                                                    "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-dark-100 transition-colors cursor-pointer hover:bg-dark-700 hover:text-white",
                                                    model.id ===
                                                        selectedModelId &&
                                                        "bg-dark-700 text-white"
                                                )}
                                                onClick={() => {
                                                    onModelSelected(model);
                                                    setOpen(false);
                                                }}
                                            >
                                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                                    {ProviderIcon && (
                                                        <ProviderIcon className="size-3.5 shrink-0 opacity-50" />
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
                                            </div>
                                        </ModelInfoPopover>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </Tooltip>
    );
}
