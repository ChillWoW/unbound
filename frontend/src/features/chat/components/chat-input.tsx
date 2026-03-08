import {
    useMemo,
    useRef,
    useState,
    useCallback,
    useEffect,
    type ReactNode
} from "react";
import TextareaAutosize from "react-textarea-autosize";
import {
    ArrowUpIcon,
    PaperclipIcon,
    XIcon,
    FileTextIcon,
    ImageIcon,
    StopIcon,
    ChatTextIcon,
    MagicWandIcon
} from "@phosphor-icons/react";
import {
    Button,
    Tooltip,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatModel, ConversationMessage } from "../types";
import { ModelSelector } from "./model-selector";
import {
    IMAGE_GENERATION_MODEL_IDS,
    type ImageGenerationConfig,
    type MessageGenerationOptions
} from "../generation-options";

const IMAGE_MIME_TYPES: Record<string, true> = {
    "image/png": true,
    "image/jpeg": true,
    "image/gif": true,
    "image/webp": true,
    "image/svg+xml": true
};

const FILE_MIME_TYPES: Record<string, true> = {
    "application/pdf": true
};

const CHARS_PER_TOKEN = 3.5;
const MESSAGE_OVERHEAD = 4;
const IMAGE_TOKEN_ESTIMATE = 1000;

function estimateTokens(messages: ConversationMessage[]): number {
    let tokens = 0;
    for (const msg of messages) {
        tokens += MESSAGE_OVERHEAD;
        for (const part of msg.parts) {
            if (part.type === "text") {
                tokens += Math.ceil(part.text.length / CHARS_PER_TOKEN);
            } else if (part.type === "image") {
                tokens += IMAGE_TOKEN_ESTIMATE;
            } else if (part.type === "tool-invocation") {
                tokens += Math.ceil(
                    JSON.stringify(part.args).length / CHARS_PER_TOKEN
                );
                if (part.result !== undefined) {
                    tokens += Math.ceil(
                        JSON.stringify(part.result).length / CHARS_PER_TOKEN
                    );
                }
            }
        }
    }
    return tokens;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatAttachment {
    id: string;
    file: File;
    preview: string | null; // object URL for images, null for files
    type: "image" | "file";
}

export type ComposerMode = "chat" | "image";

export type ChatSubmitOptions = MessageGenerationOptions;

const IMAGE_ACCEPT_STRING = Object.keys(IMAGE_MIME_TYPES).join(",");
const FILE_ACCEPT_STRING = Object.keys(FILE_MIME_TYPES).join(",");
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_ATTACHMENTS = 10;
const DEFAULT_IMAGE_MODEL_ID = IMAGE_GENERATION_MODEL_IDS[0];

const IMAGE_ASPECT_RATIOS = [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3"
] as const;

const IMAGE_SIZES = ["1K", "2K", "4K"] as const;

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
              : "text-primary-400";

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
                        className="text-dark-600"
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
        <div className="group flex items-center gap-1.5 rounded-md bg-dark-700 pr-1 pl-1 py-1 max-w-48">
            {attachment.type === "image" && attachment.preview ? (
                <img
                    src={attachment.preview}
                    alt={attachment.file.name}
                    className="size-7 shrink-0 rounded-md object-cover"
                />
            ) : (
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-dark-600 text-dark-200">
                    {attachment.type === "file" ? (
                        <FileTextIcon className="size-3.5" weight="bold" />
                    ) : (
                        <ImageIcon className="size-3.5" weight="bold" />
                    )}
                </div>
            )}

            <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-xs font-medium text-white">
                    {attachment.file.name}
                </span>
                <span className="text-[10px] text-dark-300">
                    {formatFileSize(attachment.file.size)}
                </span>
            </div>

            {!disabled && (
                <Button
                    variant="ghost"
                    onClick={onRemove}
                    className="size-5 p-0 shrink-0 ml-1 text-dark-200 hover:text-white"
                >
                    <XIcon className="size-3" weight="bold" />
                </Button>
            )}
        </div>
    );
}

// ── Chat Input ───────────────────────────────────────────────────────────────

export interface ChatInputProps {
    className?: string;
    conversationMessages?: ConversationMessage[];
    disabled?: boolean;
    isSubmitting?: boolean;
    isModelsLoading?: boolean;
    isThinkingEnabled?: boolean;
    models?: ChatModel[];
    modelsError?: string | null;
    onSelectedModelChange?: (modelId: string | null) => void;
    onThinkingChange?: (enabled: boolean) => void;
    showContextBadge?: boolean;
    toolbarSlot?: ReactNode;
    value?: string;
    onChange?: (value: string) => void;
    onStop?: () => void;
    onSubmit?: (
        value: string,
        attachments: ChatAttachment[],
        options: ChatSubmitOptions
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
    isThinkingEnabled = false,
    models = [],
    onSelectedModelChange,
    onThinkingChange,
    showContextBadge = false,
    toolbarSlot,
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
    const [mode, setMode] = useState<ComposerMode>("chat");
    const [imageModelId, setImageModelId] = useState<string | null>(null);
    const [imageAspectRatio, setImageAspectRatio] = useState<string>("1:1");
    const [imageSize, setImageSize] = useState<string>("1K");
    const imageInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isControlled = value !== undefined;
    const draft = isControlled ? value : internalValue;
    const trimmedDraft = useMemo(() => draft.trim(), [draft]);
    const hasContent = trimmedDraft.length > 0 || attachments.length > 0;

    const imageModels = useMemo(
        () =>
            models.filter((model) =>
                IMAGE_GENERATION_MODEL_IDS.includes(
                    model.id as (typeof IMAGE_GENERATION_MODEL_IDS)[number]
                )
            ),
        [models]
    );

    useEffect(() => {
        if (imageModels.length === 0) {
            setImageModelId(null);
            if (mode === "image") {
                setMode("chat");
            }
            return;
        }

        setImageModelId((current) => {
            if (current && imageModels.some((model) => model.id === current)) {
                return current;
            }

            return imageModels.find(
                (model) => model.id === DEFAULT_IMAGE_MODEL_ID
            )?.id
                ? DEFAULT_IMAGE_MODEL_ID
                : imageModels[0]?.id ?? null;
        });
    }, [imageModels, mode]);

    const selectedModel = useMemo(
        () => models.find((model) => model.id === selectedModelId) ?? null,
        [models, selectedModelId]
    );

    const selectedImageModel = useMemo(
        () => imageModels.find((model) => model.id === imageModelId) ?? null,
        [imageModels, imageModelId]
    );

    const isImageMode = mode === "image";
    const supportsImages = isImageMode
        ? true
        : selectedModel
          ? selectedModel.inputModalities.includes("image")
          : true;
    const supportsFiles = isImageMode
        ? false
        : selectedModel
          ? selectedModel.inputModalities.includes("file")
          : false;
    const isModelSelectDisabled =
        disabled || isSubmitting || isModelsLoading || models.length === 0;

    const supportsImageMode = imageModels.length > 0;
    const isGeminiImageModel =
        selectedImageModel?.id === "google/gemini-3.1-flash-image-preview";

    const isImageGenerationInFlight = useMemo(() => {
        if (!isSubmitting) return false;

        const lastMessage = conversationMessages.at(-1);

        if (
            !lastMessage ||
            lastMessage.role !== "assistant" ||
            lastMessage.status !== "pending"
        ) {
            return false;
        }

        return lastMessage.metadata?.imageGeneration === true;
    }, [conversationMessages, isSubmitting]);

    const resolvedImageModelId =
        (selectedImageModel?.id ?? DEFAULT_IMAGE_MODEL_ID) as
            | (typeof IMAGE_GENERATION_MODEL_IDS)[number]
            | undefined;

    const submitOptions: ChatSubmitOptions = isImageMode
        ? {
              mode: "image",
              modelId: resolvedImageModelId ?? DEFAULT_IMAGE_MODEL_ID,
              imageConfig: {
                  aspectRatio: imageAspectRatio,
                  ...(isGeminiImageModel ? { imageSize } : {})
              } satisfies ImageGenerationConfig
          }
        : { mode: "chat" };

    // ── Value helpers ────────────────────────────────────────────────────

    function updateValue(nextValue: string) {
        if (!isControlled) setInternalValue(nextValue);
        onChange?.(nextValue);
    }

    // ── Attachment helpers ───────────────────────────────────────────────

    const addFiles = useCallback(
        (files: FileList | File[], kind: "image" | "file") => {
            setFileError(null);
            const incoming = Array.from(files);
            const remaining = MAX_ATTACHMENTS - attachments.length;

            if (remaining <= 0) {
                setFileError(
                    `Maximum of ${MAX_ATTACHMENTS} attachments reached.`
                );
                return;
            }

            const allowedTypes =
                kind === "image" ? IMAGE_MIME_TYPES : FILE_MIME_TYPES;
            const toAdd: ChatAttachment[] = [];

            for (const file of incoming.slice(0, remaining)) {
                if (!allowedTypes[file.type]) {
                    setFileError(
                        `"${file.name}" is not a supported file type.`
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

    function handleImageInputChange(
        event: React.ChangeEvent<HTMLInputElement>
    ) {
        if (event.target.files && event.target.files.length > 0) {
            addFiles(event.target.files, "image");
        }
        event.target.value = "";
    }

    function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
        if (event.target.files && event.target.files.length > 0) {
            addFiles(event.target.files, "file");
        }
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
            const files = Array.from(event.dataTransfer.files);
            const imageFiles = files.filter((f) => IMAGE_MIME_TYPES[f.type]);
            const fileFiles = files.filter((f) => FILE_MIME_TYPES[f.type]);
            if (supportsImages && imageFiles.length > 0)
                addFiles(imageFiles, "image");
            if (supportsFiles && fileFiles.length > 0)
                addFiles(fileFiles, "file");
        }
    }

    // ── Submit ───────────────────────────────────────────────────────────

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (disabled || isSubmitting || !hasContent) return;

        await onSubmit?.(trimmedDraft, attachments, submitOptions);

        if (!isControlled) setInternalValue("");
        clearAttachments();
    }

    function handleKeySubmit() {
        if (!disabled && !isSubmitting && hasContent) {
            onSubmit?.(trimmedDraft, attachments, submitOptions);
            if (!isControlled) setInternalValue("");
            clearAttachments();
        }
    }

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <form
            className={cn(
                "w-full rounded-md border bg-dark-850 backdrop-blur-xl transition-colors",
                isDragOver
                    ? "border-primary-500 ring-1 ring-primary-500/30"
                    : "border-dark-600 focus-within:border-dark-500",
                className
            )}
            onSubmit={handleSubmit}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
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

            {fileError && (
                <p className="px-3 pt-2 text-xs text-red-400">{fileError}</p>
            )}

            <div className="px-3 pt-2">
                <div className="inline-flex items-center gap-1 rounded-md border border-dark-600 bg-dark-900 p-1">
                    <button
                        type="button"
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                            mode === "chat"
                                ? "bg-dark-700 text-dark-50"
                                : "text-dark-200 hover:bg-dark-800 hover:text-dark-50"
                        )}
                        onClick={() => setMode("chat")}
                        disabled={disabled || isSubmitting}
                    >
                        <ChatTextIcon className="size-3.5" weight="bold" />
                        Chat
                    </button>

                    <button
                        type="button"
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                            mode === "image"
                                ? "bg-dark-700 text-dark-50"
                                : "text-dark-200 hover:bg-dark-800 hover:text-dark-50",
                            !supportsImageMode &&
                                "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-dark-200"
                        )}
                        onClick={() => setMode("image")}
                        disabled={
                            disabled || isSubmitting || !supportsImageMode
                        }
                    >
                        <MagicWandIcon className="size-3.5" weight="bold" />
                        Image
                    </button>
                </div>
            </div>

            {isImageMode && (
                <div className="px-3 pt-2">
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dark-600 bg-dark-900 px-2.5 py-2">
                        <div className="min-w-40 flex-1">
                            <Select
                                value={imageModelId ?? undefined}
                                onValueChange={(value) => setImageModelId(value)}
                                disabled={
                                    disabled ||
                                    isSubmitting ||
                                    imageModels.length === 0
                                }
                            >
                                <SelectTrigger className="h-8 bg-dark-800">
                                    <SelectValue placeholder="Image model" />
                                </SelectTrigger>
                                <SelectContent>
                                    {imageModels.map((model) => (
                                        <SelectItem key={model.id} value={model.id}>
                                            {model.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="w-28">
                            <Select
                                value={imageAspectRatio}
                                onValueChange={(value) => {
                                    if (value) setImageAspectRatio(value);
                                }}
                                disabled={disabled || isSubmitting}
                            >
                                <SelectTrigger className="h-8 bg-dark-800">
                                    <SelectValue placeholder="Aspect" />
                                </SelectTrigger>
                                <SelectContent>
                                    {IMAGE_ASPECT_RATIOS.map((ratio) => (
                                        <SelectItem key={ratio} value={ratio}>
                                            {ratio}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {isGeminiImageModel && (
                            <div className="w-24">
                                <Select
                                    value={imageSize}
                                    onValueChange={(value) => {
                                        if (value) setImageSize(value);
                                    }}
                                    disabled={disabled || isSubmitting}
                                >
                                    <SelectTrigger className="h-8 bg-dark-800">
                                        <SelectValue placeholder="Size" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {IMAGE_SIZES.map((size) => (
                                            <SelectItem key={size} value={size}>
                                                {size}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="px-3 pt-3">
                <TextareaAutosize
                    className="w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-dark-200"
                    minRows={1}
                    maxRows={8}
                    disabled={disabled}
                    placeholder={
                        isImageMode
                            ? "Describe the image you want to generate..."
                            : placeholder
                    }
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

                        const imageFiles: File[] = [];
                        const fileFiles: File[] = [];
                        for (const item of Array.from(items)) {
                            if (item.kind === "file") {
                                const file = item.getAsFile();
                                if (!file) continue;
                                if (IMAGE_MIME_TYPES[file.type])
                                    imageFiles.push(file);
                                else if (FILE_MIME_TYPES[file.type])
                                    fileFiles.push(file);
                            }
                        }

                        if (supportsImages && imageFiles.length > 0)
                            addFiles(imageFiles, "image");
                        if (supportsFiles && fileFiles.length > 0)
                            addFiles(fileFiles, "file");
                    }}
                />
            </div>

            <div className="flex items-center justify-between gap-4 px-2 pb-2 pt-1">
                <div className="flex min-w-0 items-center gap-2">
                    {isImageMode ? (
                        <span className="text-xs text-dark-200 px-1">
                            Image generation mode
                        </span>
                    ) : (
                        <div className="min-w-0">
                            <ModelSelector
                                selectedModelId={selectedModelId}
                                models={models}
                                onModelSelected={(model) =>
                                    onSelectedModelChange?.(model.id)
                                }
                                disabled={isModelSelectDisabled}
                                isThinkingEnabled={isThinkingEnabled}
                                onThinkingChange={onThinkingChange}
                            />
                        </div>
                    )}
                    {toolbarSlot}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {showContextBadge && !isImageMode ? (
                        <ContextWindowMeter
                            model={selectedModel}
                            estimatedTokenCount={estimateTokens(
                                conversationMessages
                            )}
                        />
                    ) : null}

                    <input
                        ref={imageInputRef}
                        type="file"
                        accept={IMAGE_ACCEPT_STRING}
                        multiple
                        className="hidden"
                        onChange={handleImageInputChange}
                        disabled={disabled || isSubmitting}
                    />

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={FILE_ACCEPT_STRING}
                        multiple
                        className="hidden"
                        onChange={handleFileInputChange}
                        disabled={disabled || isSubmitting}
                    />

                    {supportsImages && (
                        <Tooltip content="Attach images">
                            <Button
                                type="button"
                                variant="ghost"
                                className="size-8 p-0 text-dark-200 hover:text-dark-50 hover:bg-dark-700"
                                disabled={
                                    disabled ||
                                    isSubmitting ||
                                    attachments.length >= MAX_ATTACHMENTS
                                }
                                onClick={() => imageInputRef.current?.click()}
                            >
                                <ImageIcon className="size-4" weight="bold" />
                            </Button>
                        </Tooltip>
                    )}

                    {supportsFiles && (
                        <Tooltip content="Attach files">
                            <Button
                                type="button"
                                variant="ghost"
                                className="size-8 p-0 text-dark-200 hover:text-dark-50 hover:bg-dark-700"
                                disabled={
                                    disabled ||
                                    isSubmitting ||
                                    attachments.length >= MAX_ATTACHMENTS
                                }
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <PaperclipIcon
                                    className="size-4"
                                    weight="bold"
                                />
                            </Button>
                        </Tooltip>
                    )}

                    {isSubmitting &&
                    onStop &&
                    !isImageMode &&
                    !isImageGenerationInFlight ? (
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
