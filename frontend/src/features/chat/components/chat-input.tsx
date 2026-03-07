import { useMemo, useRef, useState, useCallback } from "react";
import TextareaAutosize from "react-textarea-autosize";
import {
    ArrowUpIcon,
    PaperclipIcon,
    XIcon,
    FileTextIcon,
    ImageIcon,
    StopIcon
} from "@phosphor-icons/react";
import { Button, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatModel, ConversationMessage } from "../types";
import { ModelSelector } from "./model-selector";

function estimateTokens(messages: ConversationMessage[]): number {
    let chars = 0;
    for (const msg of messages) {
        for (const part of msg.parts) {
            if (part.type === "text") {
                chars += part.text.length;
            } else if (part.type === "tool-invocation") {
                chars += JSON.stringify(part.args).length;
                if (part.result !== undefined) {
                    chars += JSON.stringify(part.result).length;
                }
            }
        }
    }
    return Math.ceil(chars / 4);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatAttachment {
    id: string;
    file: File;
    preview: string | null; // object URL for images, null for PDFs
    type: "image" | "pdf";
}

const ACCEPTED_TYPES: Record<string, "image" | "pdf"> = {
    "image/png": "image",
    "image/jpeg": "image",
    "image/gif": "image",
    "image/webp": "image",
    "image/svg+xml": "image",
    "application/pdf": "pdf"
};

const ACCEPT_STRING = Object.keys(ACCEPTED_TYPES).join(",");
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_ATTACHMENTS = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateId(): string {
    return Math.random().toString(36).slice(2, 10);
}

// ── Context Window Meter ─────────────────────────────────────────────────────

function ContextWindowMeter({
    model,
    estimatedTokenCount
}: {
    model: ChatModel | null;
    estimatedTokenCount: number;
}) {
    const size = 24;
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const contextLength = model?.contextLength ?? 0;
    const ratio =
        contextLength > 0
            ? Math.min(estimatedTokenCount / contextLength, 1)
            : 0;

    const dashLength = circumference * ratio;
    const gapLength = circumference - dashLength;

    const colorClass =
        ratio > 0.9
            ? "text-red-400"
            : ratio > 0.7
              ? "text-amber-400"
              : "text-primary-500";

    const usedFormatted =
        estimatedTokenCount >= 1000
            ? `~${(estimatedTokenCount / 1000).toFixed(1)}K`
            : `~${estimatedTokenCount}`;

    return (
        <Tooltip
            disabled={!model}
            content={
                model
                    ? `${model.name}: ${usedFormatted} / ${formatContextWindow(model.contextLength)} tokens`
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
                        className={colorClass}
                    />
                </svg>
            </div>
        </Tooltip>
    );
}

// ── Attachment Preview ───────────────────────────────────────────────────────

function AttachmentChip({
    attachment,
    onRemove,
    disabled
}: {
    attachment: ChatAttachment;
    onRemove: () => void;
    disabled: boolean;
}) {
    return (
        <div
            className={cn(
                "group relative flex items-center gap-2 rounded-lg border border-dark-600 bg-dark-700/60 px-2 py-1.5",
                "transition-colors hover:border-dark-500"
            )}
        >
            {attachment.type === "image" && attachment.preview ? (
                <img
                    src={attachment.preview}
                    alt={attachment.file.name}
                    className="size-8 shrink-0 rounded object-cover"
                />
            ) : (
                <div className="flex size-8 shrink-0 items-center justify-center rounded bg-dark-600">
                    {attachment.type === "pdf" ? (
                        <FileTextIcon
                            className="size-4 text-red-400"
                            weight="bold"
                        />
                    ) : (
                        <ImageIcon
                            className="size-4 text-blue-400"
                            weight="bold"
                        />
                    )}
                </div>
            )}

            <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs text-white max-w-[120px]">
                    {attachment.file.name}
                </span>
                <span className="text-[10px] text-dark-300">
                    {formatFileSize(attachment.file.size)}
                </span>
            </div>

            {!disabled && (
                <button
                    type="button"
                    onClick={onRemove}
                    className={cn(
                        "absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full",
                        "bg-dark-600 text-dark-200 opacity-0 transition-opacity",
                        "hover:bg-dark-500 hover:text-white group-hover:opacity-100"
                    )}
                    aria-label={`Remove ${attachment.file.name}`}
                >
                    <XIcon className="size-3" weight="bold" />
                </button>
            )}
        </div>
    );
}

// ── Chat Input ───────────────────────────────────────────────────────────────

interface ChatInputProps {
    className?: string;
    conversationMessages?: ConversationMessage[];
    disabled?: boolean;
    isSubmitting?: boolean;
    isModelsLoading?: boolean;
    models?: ChatModel[];
    modelsError?: string | null;
    onSelectedModelChange?: (modelId: string | null) => void;
    showContextBadge?: boolean;
    value?: string;
    onChange?: (value: string) => void;
    onStop?: () => void;
    onSubmit?: (
        value: string,
        attachments: ChatAttachment[]
    ) => void | Promise<void>;
    placeholder?: string;
    selectedModelId?: string | null;
}

export function ChatInput({
    className,
    conversationMessages = [],
    disabled = false,
    isSubmitting = false,
    isModelsLoading = false,
    models = [],
    modelsError = null,
    onSelectedModelChange,
    showContextBadge = false,
    value,
    onChange,
    onStop,
    onSubmit,
    placeholder = "Ask anything, sketch an idea, or start a new thread...",
    selectedModelId = null
}: ChatInputProps) {
    const [internalValue, setInternalValue] = useState("");
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const [fileError, setFileError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isControlled = value !== undefined;
    const draft = isControlled ? value : internalValue;
    const trimmedDraft = useMemo(() => draft.trim(), [draft]);
    const hasContent = trimmedDraft.length > 0 || attachments.length > 0;

    const selectedModel = useMemo(
        () => models.find((model) => model.id === selectedModelId) ?? null,
        [models, selectedModelId]
    );
    const supportsImages = selectedModel
        ? selectedModel.inputModalities.includes("image")
        : true;
    const isModelSelectDisabled =
        disabled || isSubmitting || isModelsLoading || models.length === 0;
    const modelMessage = useMemo(() => {
        if (modelsError) return modelsError;
        if (isModelsLoading) return "Loading models...";
        if (models.length === 0) return "No models available.";
        return null;
    }, [isModelsLoading, models.length, modelsError]);

    // ── Value helpers ────────────────────────────────────────────────────

    function updateValue(nextValue: string) {
        if (!isControlled) setInternalValue(nextValue);
        onChange?.(nextValue);
    }

    // ── Attachment helpers ───────────────────────────────────────────────

    const addFiles = useCallback(
        (files: FileList | File[]) => {
            setFileError(null);
            const incoming = Array.from(files);
            const remaining = MAX_ATTACHMENTS - attachments.length;

            if (remaining <= 0) {
                setFileError(
                    `Maximum of ${MAX_ATTACHMENTS} attachments reached.`
                );
                return;
            }

            const toAdd: ChatAttachment[] = [];

            for (const file of incoming.slice(0, remaining)) {
                const kind = ACCEPTED_TYPES[file.type];

                if (!kind) {
                    setFileError(
                        `"${file.name}" is not a supported file type. Use images or PDFs.`
                    );
                    continue;
                }

                if (file.size > MAX_FILE_SIZE) {
                    setFileError(
                        `"${file.name}" exceeds the 20 MB size limit.`
                    );
                    continue;
                }

                toAdd.push({
                    id: generateId(),
                    file,
                    preview:
                        kind === "image" ? URL.createObjectURL(file) : null,
                    type: kind
                });
            }

            if (toAdd.length > 0) {
                setAttachments((prev) => [...prev, ...toAdd]);
            }
        },
        [attachments.length]
    );

    const removeAttachment = useCallback((id: string) => {
        setAttachments((prev) => {
            const target = prev.find((a) => a.id === id);
            if (target?.preview) URL.revokeObjectURL(target.preview);
            return prev.filter((a) => a.id !== id);
        });
        setFileError(null);
    }, []);

    function clearAttachments() {
        for (const a of attachments) {
            if (a.preview) URL.revokeObjectURL(a.preview);
        }
        setAttachments([]);
    }

    // ── File input handler ───────────────────────────────────────────────

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        if (event.target.files && event.target.files.length > 0) {
            addFiles(event.target.files);
        }
        // Reset so the same file can be re-selected
        event.target.value = "";
    }

    // ── Drag & drop ─────────────────────────────────────────────────────

    const [isDragOver, setIsDragOver] = useState(false);

    function handleDragOver(event: React.DragEvent) {
        event.preventDefault();
        if (!disabled && !isSubmitting) setIsDragOver(true);
    }

    function handleDragLeave(event: React.DragEvent) {
        event.preventDefault();
        setIsDragOver(false);
    }

    function handleDrop(event: React.DragEvent) {
        event.preventDefault();
        setIsDragOver(false);
        if (!disabled && !isSubmitting && event.dataTransfer.files.length > 0) {
            addFiles(event.dataTransfer.files);
        }
    }

    // ── Submit ───────────────────────────────────────────────────────────

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (disabled || isSubmitting || !hasContent) return;

        await onSubmit?.(trimmedDraft, attachments);

        if (!isControlled) setInternalValue("");
        clearAttachments();
    }

    function handleKeySubmit() {
        if (!disabled && !isSubmitting && hasContent) {
            onSubmit?.(trimmedDraft, attachments);
            if (!isControlled) setInternalValue("");
            clearAttachments();
        }
    }

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <form
            className={cn(
                "w-full rounded-md border bg-dark-800/80 backdrop-blur-xl transition-colors",
                isDragOver
                    ? "border-primary-500 ring-1 ring-primary-500/30"
                    : "border-dark-600",
                className
            )}
            onSubmit={handleSubmit}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Attachment previews */}
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                    {attachments.map((attachment) => (
                        <AttachmentChip
                            key={attachment.id}
                            attachment={attachment}
                            onRemove={() => removeAttachment(attachment.id)}
                            disabled={disabled || isSubmitting}
                        />
                    ))}
                </div>
            )}

            {/* File error */}
            {fileError && (
                <p className="px-3 pt-2 text-xs text-red-400">{fileError}</p>
            )}

            {/* Textarea */}
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
                            handleKeySubmit();
                        }
                    }}
                    onPaste={(event) => {
                        const items = event.clipboardData?.items;
                        if (!items) return;

                        const files: File[] = [];
                        for (const item of Array.from(items)) {
                            if (item.kind === "file") {
                                const file = item.getAsFile();
                                if (file) files.push(file);
                            }
                        }

                        if (files.length > 0) {
                            addFiles(files);
                        }
                    }}
                />
            </div>

            {/* Toolbar */}
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
                        <ContextWindowMeter
                            model={selectedModel}
                            estimatedTokenCount={estimateTokens(
                                conversationMessages
                            )}
                        />
                    ) : null}

                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPT_STRING}
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={disabled || isSubmitting}
                    />

                    <Tooltip content={supportsImages ? "Attach images or PDFs" : "This model doesn't support image attachments"}>
                        <Button
                            type="button"
                            variant="ghost"
                            className="size-8 p-0 text-dark-100 hover:text-white"
                            disabled={
                                disabled ||
                                isSubmitting ||
                                !supportsImages ||
                                attachments.length >= MAX_ATTACHMENTS
                            }
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <PaperclipIcon className="size-4" weight="bold" />
                        </Button>
                    </Tooltip>

                    {isSubmitting && onStop ? (
                        <Tooltip content="Stop generation">
                            <Button
                                type="button"
                                variant="primary"
                                className="size-8 p-0"
                                onClick={onStop}
                            >
                                <StopIcon className="size-4" weight="fill" />
                            </Button>
                        </Tooltip>
                    ) : (
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={disabled || isSubmitting || !hasContent}
                            className="size-8 p-0"
                        >
                            <ArrowUpIcon className="size-4" weight="bold" />
                        </Button>
                    )}
                </div>
            </div>
        </form>
    );
}
