import { useMemo, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, PaperclipIcon } from "@phosphor-icons/react";
import { Button, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatModel } from "../types";
import { ModelSelector } from "./model-selector";

function formatContextWindow(value: number | null): string {
    if (!value || value < 1000) {
        return value ? String(value) : "--";
    }

    if (value >= 1_000_000) {
        const millions = value / 1_000_000;
        return Number.isInteger(millions)
            ? `${millions}M`
            : `${millions.toFixed(1)}M`;
    }

    const thousands = value / 1000;
    return Number.isInteger(thousands)
        ? `${thousands}K`
        : `${thousands.toFixed(1)}K`;
}

function ContextWindowMeter({ model }: { model: ChatModel | null }) {
    const size = 24;
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const placeholderRatio = 0.22;
    const dashLength = circumference * placeholderRatio;
    const gapLength = circumference - dashLength;

    return (
        <Tooltip
            disabled={!model}
            content={
                model
                    ? `${model.name} context window: ${formatContextWindow(model.contextLength)} tokens max`
                    : "Context usage unavailable"
            }
            side="top"
        >
            <div className="relative flex size-8 items-center justify-center">
                <svg
                    className="size-4 -rotate-90"
                    viewBox={`0 0 ${size} ${size}`}
                    aria-hidden="true"
                >
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        className="text-dark-700"
                    />
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={`${dashLength} ${gapLength}`}
                        className="text-primary-500"
                    />
                </svg>
            </div>
        </Tooltip>
    );
}

interface ChatInputProps {
    className?: string;
    disabled?: boolean;
    isSubmitting?: boolean;
    isModelsLoading?: boolean;
    models?: ChatModel[];
    modelsError?: string | null;
    onSelectedModelChange?: (modelId: string | null) => void;
    showContextBadge?: boolean;
    value?: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void | Promise<void>;
    placeholder?: string;
    selectedModelId?: string | null;
}

export function ChatInput({
    className,
    disabled = false,
    isSubmitting = false,
    isModelsLoading = false,
    models = [],
    modelsError = null,
    onSelectedModelChange,
    showContextBadge = false,
    value,
    onChange,
    onSubmit,
    placeholder = "Ask anything, sketch an idea, or start a new thread...",
    selectedModelId = null
}: ChatInputProps) {
    const [internalValue, setInternalValue] = useState("");

    const isControlled = value !== undefined;
    const draft = isControlled ? value : internalValue;
    const trimmedDraft = useMemo(() => draft.trim(), [draft]);
    const selectedModel = useMemo(
        () => models.find((model) => model.id === selectedModelId) ?? null,
        [models, selectedModelId]
    );
    const isModelSelectDisabled =
        disabled || isSubmitting || isModelsLoading || models.length === 0;
    const modelMessage = useMemo(() => {
        if (modelsError) {
            return modelsError;
        }

        if (isModelsLoading) {
            return "Loading models...";
        }

        if (models.length === 0) {
            return "No models available.";
        }

        return null;
    }, [isModelsLoading, models.length, modelsError]);

    function updateValue(nextValue: string) {
        if (!isControlled) {
            setInternalValue(nextValue);
        }

        onChange?.(nextValue);
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (disabled || isSubmitting || !trimmedDraft) {
            return;
        }

        await onSubmit?.(trimmedDraft);

        if (!isControlled) {
            setInternalValue("");
        }
    }

    return (
        <form
            className={cn(
                "w-full rounded-md border border-dark-600 bg-dark-800/80 backdrop-blur-xl",
                className
            )}
            onSubmit={handleSubmit}
        >
            <div className="px-3 pt-3">
                <TextareaAutosize
                    className="w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-dark-200"
                    minRows={1}
                    maxRows={8}
                    disabled={disabled || isSubmitting}
                    placeholder={placeholder}
                    value={draft}
                    onChange={(event) => updateValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (!disabled && !isSubmitting && trimmedDraft) {
                                onSubmit?.(trimmedDraft);
                                if (!isControlled) {
                                    setInternalValue("");
                                }
                            }
                        }
                    }}
                />
            </div>

            <div className="flex items-center justify-between gap-4 px-2 pb-2 pt-1">
                <div className="flex items-center gap-2">
                    <ModelSelector
                        selectedModelId={selectedModelId}
                        models={models}
                        onModelSelected={(model) =>
                            onSelectedModelChange?.(model.id)
                        }
                        disabled={isModelSelectDisabled}
                    />

                    {modelMessage ? (
                        <p className="truncate text-xs text-dark-300">
                            {modelMessage}
                        </p>
                    ) : null}
                </div>

                <div className="flex items-center gap-2">
                    {showContextBadge ? (
                        <ContextWindowMeter model={selectedModel} />
                    ) : null}

                    <Tooltip content="Attach a file">
                        <Button
                            variant="ghost"
                            className="size-8 p-0 text-dark-100 hover:text-white"
                        >
                            <PaperclipIcon className="size-4" weight="bold" />
                        </Button>
                    </Tooltip>

                    <Button
                        type="submit"
                        variant="primary"
                        disabled={disabled || isSubmitting || !trimmedDraft}
                        className="size-8 p-0"
                    >
                        <ArrowUpIcon className="size-4" weight="bold" />
                    </Button>
                </div>
            </div>
        </form>
    );
}
