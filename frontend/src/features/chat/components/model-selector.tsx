import {
    Input,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Tooltip
} from "@/components/ui";
import type { ChatModel } from "../types";
import { useMemo } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Arcee, Qwen, Stepfun } from "@lobehub/icons";

const ICONS: Record<string, React.ComponentType<any>> = {
    qwen: Qwen,
    stepfun: Stepfun,
    "arcee-ai": Arcee
};

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
    const modelName = useMemo(() => {
        if (!selectedModelId) {
            return "Select a model";
        }

        return models.find((model) => model.id === selectedModelId)?.name;
    }, [selectedModelId, models]);

    const ModelIcon = useMemo(() => {
        if (!selectedModelId) {
            return null;
        }

        return ICONS[
            models.find((model) => model.id === selectedModelId)?.provider ?? ""
        ];
    }, [selectedModelId, models]);

    return (
        <Tooltip content="Select a model">
            <Popover>
                <div className="w-full max-w-md">
                    <PopoverTrigger
                        className={cn(
                            "inline-flex max-w-48 items-center gap-2 px-3 py-1 hover:bg-dark-700 rounded-md text-xs outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 transition-colors cursor-pointer",
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

                <PopoverContent side="top" className="p-0 overflow-hidden">
                    <div className="flex flex-col gap-2">
                        <Input
                            leftSection={
                                <MagnifyingGlassIcon
                                    className="size-4"
                                    weight="bold"
                                />
                            }
                            placeholder="Search models"
                            className="border-b border-dark-600 rounded-none"
                        />

                        <div className="flex flex-col gap-1 p-1 overflow-y-auto max-h-[300px]">
                            {models.map((model) => (
                                <div
                                    key={model.id}
                                    className={cn(
                                        "flex items-center gap-2 rounded-md px-2 py-1 text-sm text-dark-100 hover:text-white hover:bg-dark-600 transition-colors cursor-pointer",
                                        model.id === selectedModelId &&
                                            "text-white bg-dark-600"
                                    )}
                                    onClick={() => onModelSelected(model)}
                                >
                                    <span className="truncate">
                                        {model.name}
                                    </span>

                                    {model.free && (
                                        <div className="text-xs text-green-200 bg-green-500/10 rounded-md px-2 py-0.5">
                                            Free
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </Tooltip>
    );
}
