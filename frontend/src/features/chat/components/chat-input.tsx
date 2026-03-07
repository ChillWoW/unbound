import { useMemo, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

interface ChatInputProps {
    className?: string;
    disabled?: boolean;
    isSubmitting?: boolean;
    value?: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void | Promise<void>;
    placeholder?: string;
}

export function ChatInput({
    className,
    disabled = false,
    isSubmitting = false,
    value,
    onChange,
    onSubmit,
    placeholder = "Ask anything, sketch an idea, or start a new thread..."
}: ChatInputProps) {
    const [internalValue, setInternalValue] = useState("");

    const isControlled = value !== undefined;
    const draft = isControlled ? value : internalValue;
    const trimmedDraft = useMemo(() => draft.trim(), [draft]);

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
                />
            </div>

            <div className="flex items-center justify-between gap-4 px-3 pb-3 pt-1">
                <div className="flex items-center gap-2">
                    {/* Stuff like file attachments, etc. later */}
                </div>

                <Button
                    type="submit"
                    variant="primary"
                    disabled={disabled || isSubmitting || !trimmedDraft}
                    className="size-8 p-0"
                >
                    <ArrowUpIcon className="size-4" weight="bold" />
                </Button>
            </div>
        </form>
    );
}
