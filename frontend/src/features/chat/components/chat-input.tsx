import {
    useMemo,
    useRef,
    useState,
    useCallback,
    type ReactNode,
    type RefObject
} from "react";
import { useNavigate } from "@tanstack/react-router";
import TextareaAutosize from "react-textarea-autosize";
import {
    ArrowUpIcon,
    PaperclipIcon,
    XIcon,
    FileTextIcon,
    ImageIcon,
    StopIcon,
    BrainIcon,
    CompassIcon
} from "@phosphor-icons/react";
import { Button, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { IMAGE_ACCEPT_STRING, splitAttachmentFiles } from "../attachment-utils";
import type {
    ChatErrorRecovery,
    ChatModel,
    ConversationMessage,
    ProviderType
} from "../types";
import { ModelSelector } from "./model-selector";
import { useChat } from "../chat-context";

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
            } else if (part.type === "file") {
                tokens += Math.ceil((part.size ?? 0) / 4);
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

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_ATTACHMENTS = 10;
const EMPTY_CONFIGURED_PROVIDERS: ProviderType[] = [];
const EMPTY_CONVERSATION_MESSAGES: ConversationMessage[] = [];
const EMPTY_MODELS: ChatModel[] = [];

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

function ModelErrorBanner({
    isModelsLoading,
    modelsError,
    modelsErrorRecovery,
    onReloadModels
}: {
    isModelsLoading: boolean;
    modelsError: string | null;
    modelsErrorRecovery: ChatErrorRecovery | null;
    onReloadModels: () => void;
}) {
    const navigate = useNavigate();

    if (!modelsError) {
        return null;
    }

    return (
        <div className="mx-3 mt-3 rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            <p>{modelsErrorRecovery?.message ?? modelsError}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                {modelsErrorRecovery?.action === "open_settings" && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate({ to: "/settings" })}
                    >
                        Open settings
                    </Button>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isModelsLoading}
                    onClick={onReloadModels}
                >
                    {isModelsLoading ? "Reloading..." : "Reload models"}
                </Button>
            </div>
        </div>
    );
}

function AttachmentPreviewList({
    attachments,
    disabled,
    isSubmitting,
    onRemove
}: {
    attachments: ChatAttachment[];
    disabled: boolean;
    isSubmitting: boolean;
    onRemove: (id: string) => void;
}) {
    if (attachments.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((attachment) => (
                <AttachmentChip
                    key={attachment.id}
                    attachment={attachment}
                    onRemove={() => onRemove(attachment.id)}
                    disabled={disabled || isSubmitting}
                />
            ))}
        </div>
    );
}

function ChatComposerTextarea({
    disabled,
    draft,
    handleIncomingFiles,
    onSubmit,
    placeholder,
    supportsImages,
    updateValue
}: {
    disabled: boolean;
    draft: string;
    handleIncomingFiles: (files: FileList | File[]) => void;
    onSubmit: () => void;
    placeholder: string;
    supportsImages: boolean;
    updateValue: (value: string) => void;
}) {
    return (
        <div className="px-3 pt-3">
            <TextareaAutosize
                className="w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-dark-200"
                minRows={1}
                maxRows={8}
                disabled={disabled}
                placeholder={placeholder}
                value={draft}
                onChange={(event) => updateValue(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        onSubmit();
                    }
                }}
                onPaste={(event) => {
                    const items = event.clipboardData?.items;
                    if (!items) return;

                    const files: File[] = [];
                    for (const item of Array.from(items)) {
                        if (item.kind !== "file") continue;
                        const file = item.getAsFile();
                        if (file) files.push(file);
                    }

                    if (files.length === 0) {
                        return;
                    }

                    if (
                        !supportsImages &&
                        splitAttachmentFiles(files).imageFiles.length > 0
                    ) {
                        event.preventDefault();
                    }

                    handleIncomingFiles(files);
                }}
            />
        </div>
    );
}

function ChatInputToolbar({
    attachmentsCount,
    configuredProviders,
    conversationMessages,
    disabled,
    fileInputRef,
    handleFileInputChange,
    handleImageInputChange,
    imageInputRef,
    isModelSelectDisabled,
    isSubmitting,
    isDeepResearchEnabled,
    isThinkingEnabled,
    models,
    onDeepResearchChange,
    onSelectedModelChange,
    onStop,
    onThinkingChange,
    selectedModel,
    selectedModelId,
    showContextBadge,
    supportsNativeFiles,
    supportsImages,
    toolbarSlot,
    hasContent
}: {
    attachmentsCount: number;
    configuredProviders: ProviderType[];
    conversationMessages: ConversationMessage[];
    disabled: boolean;
    fileInputRef: RefObject<HTMLInputElement | null>;
    handleFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleImageInputChange: (
        event: React.ChangeEvent<HTMLInputElement>
    ) => void;
    imageInputRef: RefObject<HTMLInputElement | null>;
    isModelSelectDisabled: boolean;
    isSubmitting: boolean;
    isDeepResearchEnabled: boolean;
    isThinkingEnabled: boolean;
    models: ChatModel[];
    onDeepResearchChange?: (enabled: boolean) => void;
    onSelectedModelChange?: (
        modelId: string | null,
        source?: ProviderType
    ) => void;
    onStop?: () => void;
    onThinkingChange?: (enabled: boolean) => void;
    selectedModel: ChatModel | null;
    selectedModelId: string | null;
    showContextBadge: boolean;
    supportsNativeFiles: boolean;
    supportsImages: boolean;
    toolbarSlot?: ReactNode;
    hasContent: boolean;
}) {
    const attachmentsDisabled =
        disabled || isSubmitting || attachmentsCount >= MAX_ATTACHMENTS;

    return (
        <div className="flex items-center justify-between gap-4 px-2 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-1">
                <div className="min-w-0">
                    <ModelSelector
                        selectedModelId={selectedModelId}
                        models={models}
                        configuredProviders={configuredProviders}
                        onModelSelected={(model) =>
                            onSelectedModelChange?.(model.id, model.source)
                        }
                        disabled={isModelSelectDisabled}
                        isThinkingEnabled={isThinkingEnabled}
                    />
                </div>
                {onThinkingChange && (
                    <Tooltip content="Thinking" side="top">
                        <Button
                            type="button"
                            variant="ghost"
                            className={cn(
                                "size-8 p-0 transition-colors",
                                isThinkingEnabled
                                    ? "bg-dark-700 text-dark-50 hover:bg-dark-600"
                                    : "text-dark-300 hover:bg-dark-700 hover:text-dark-50"
                            )}
                            onClick={() => onThinkingChange(!isThinkingEnabled)}
                        >
                            <BrainIcon
                                className="size-4"
                                weight={isThinkingEnabled ? "fill" : "bold"}
                            />
                        </Button>
                    </Tooltip>
                )}

                {onDeepResearchChange && (
                    <Tooltip content="Deep Research" side="top">
                        <Button
                            type="button"
                            variant="ghost"
                            className={cn(
                                "size-8 p-0 transition-colors",
                                isDeepResearchEnabled
                                    ? "bg-dark-700 text-dark-50 hover:bg-dark-600"
                                    : "text-dark-300 hover:bg-dark-700 hover:text-dark-50"
                            )}
                            onClick={() =>
                                onDeepResearchChange(!isDeepResearchEnabled)
                            }
                        >
                            <CompassIcon
                                className="size-4"
                                weight={isDeepResearchEnabled ? "fill" : "bold"}
                            />
                        </Button>
                    </Tooltip>
                )}

                {toolbarSlot}
            </div>

            <div className="flex shrink-0 items-center gap-2">
                {showContextBadge ? (
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
                            className="size-8 p-0 text-dark-200 hover:bg-dark-700 hover:text-dark-50"
                            disabled={attachmentsDisabled}
                            onClick={() => imageInputRef.current?.click()}
                        >
                            <ImageIcon className="size-4" weight="bold" />
                        </Button>
                    </Tooltip>
                )}

                <Tooltip
                    content={
                        supportsNativeFiles
                            ? "Attach files"
                            : "Attach files as text context"
                    }
                >
                    <Button
                        type="button"
                        variant="ghost"
                        className="size-8 p-0 text-dark-200 hover:bg-dark-700 hover:text-dark-50"
                        disabled={attachmentsDisabled}
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
    );
}

// ── Chat Input ───────────────────────────────────────────────────────────────

export interface ChatInputProps {
    className?: string;
    configuredProviders?: ProviderType[];
    conversationMessages?: ConversationMessage[];
    disabled?: boolean;
    isSubmitting?: boolean;
    isModelsLoading?: boolean;
    isDeepResearchEnabled?: boolean;
    isThinkingEnabled?: boolean;
    models?: ChatModel[];
    modelsError?: string | null;
    modelsErrorRecovery?: ChatErrorRecovery | null;
    onDeepResearchChange?: (enabled: boolean) => void;
    onSelectedModelChange?: (
        modelId: string | null,
        source?: ProviderType
    ) => void;
    onThinkingChange?: (enabled: boolean) => void;
    showContextBadge?: boolean;
    toolbarSlot?: ReactNode;
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
    configuredProviders = EMPTY_CONFIGURED_PROVIDERS,
    conversationMessages = EMPTY_CONVERSATION_MESSAGES,
    disabled = false,
    isSubmitting = false,
    isModelsLoading = false,
    isDeepResearchEnabled = false,
    isThinkingEnabled = false,
    models = EMPTY_MODELS,
    modelsError = null,
    modelsErrorRecovery = null,
    onDeepResearchChange,
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
    const { loadModels } = useChat();
    const [internalValue, setInternalValue] = useState("");
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const [fileError, setFileError] = useState<string | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
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
    const supportsNativeFiles = selectedModel
        ? selectedModel.inputModalities.includes("file")
        : false;
    const isModelSelectDisabled =
        disabled || isModelsLoading || models.length === 0;

    // ── Value helpers ────────────────────────────────────────────────────

    function updateValue(nextValue: string) {
        if (!isControlled) setInternalValue(nextValue);
        onChange?.(nextValue);
    }

    // ── Attachment helpers ───────────────────────────────────────────────

    const addFiles = useCallback(
        (files: FileList | File[], kind: "image" | "file") => {
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
                if (
                    kind === "image" &&
                    splitAttachmentFiles([file]).imageFiles.length === 0
                ) {
                    setFileError(
                        `"${file.name}" is not a supported image file.`
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

    const handleIncomingFiles = useCallback(
        (files: FileList | File[]) => {
            const incoming = Array.from(files);

            if (incoming.length === 0) {
                return;
            }

            setFileError(null);

            const remaining = MAX_ATTACHMENTS - attachments.length;

            if (remaining <= 0) {
                setFileError(
                    `Maximum of ${MAX_ATTACHMENTS} attachments reached.`
                );
                return;
            }

            const { imageFiles, fileFiles } = splitAttachmentFiles(incoming);
            const nextImageFiles = supportsImages
                ? imageFiles.slice(0, remaining)
                : [];
            const nextFileFiles = fileFiles.slice(
                0,
                Math.max(remaining - nextImageFiles.length, 0)
            );

            if (nextImageFiles.length > 0) {
                addFiles(nextImageFiles, "image");
            }

            if (nextFileFiles.length > 0) {
                addFiles(nextFileFiles, "file");
            }

            if (
                (supportsImages ? imageFiles.length : 0) + fileFiles.length >
                remaining
            ) {
                setFileError(
                    (current) =>
                        current ??
                        `Maximum of ${MAX_ATTACHMENTS} attachments reached.`
                );
            }

            if (!supportsImages && imageFiles.length > 0) {
                setFileError(
                    (current) =>
                        current ??
                        `${selectedModel?.name ?? "This model"} does not support image attachments.`
                );
            }
        },
        [addFiles, attachments.length, selectedModel?.name, supportsImages]
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
            setFileError(null);
            addFiles(event.target.files, "image");
        }
        event.target.value = "";
    }

    function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
        if (event.target.files && event.target.files.length > 0) {
            handleIncomingFiles(event.target.files);
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
            handleIncomingFiles(event.dataTransfer.files);
        }
    }

    // ── Submit ───────────────────────────────────────────────────────────

    async function submitMessage() {
        if (disabled || isSubmitting || !hasContent) return;

        const nextDraft = trimmedDraft;
        const nextAttachments = attachments;

        if (!isControlled) {
            setInternalValue("");
            clearAttachments();
        }

        await onSubmit?.(nextDraft, nextAttachments);

        if (isControlled) {
            clearAttachments();
        }
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await submitMessage();
    }

    function handleKeySubmit() {
        void submitMessage();
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
            <ModelErrorBanner
                isModelsLoading={isModelsLoading}
                modelsError={modelsError}
                modelsErrorRecovery={modelsErrorRecovery}
                onReloadModels={() => {
                    void loadModels().catch(() => undefined);
                }}
            />

            <AttachmentPreviewList
                attachments={attachments}
                disabled={disabled}
                isSubmitting={isSubmitting}
                onRemove={removeAttachment}
            />

            {fileError && (
                <p className="px-3 pt-2 text-xs text-red-400">{fileError}</p>
            )}

            <ChatComposerTextarea
                disabled={disabled}
                draft={draft}
                handleIncomingFiles={handleIncomingFiles}
                onSubmit={handleKeySubmit}
                placeholder={placeholder}
                supportsImages={supportsImages}
                updateValue={updateValue}
            />

            <ChatInputToolbar
                attachmentsCount={attachments.length}
                configuredProviders={configuredProviders}
                conversationMessages={conversationMessages}
                disabled={disabled}
                fileInputRef={fileInputRef}
                handleFileInputChange={handleFileInputChange}
                handleImageInputChange={handleImageInputChange}
                imageInputRef={imageInputRef}
                isModelSelectDisabled={isModelSelectDisabled}
                isSubmitting={isSubmitting}
                isDeepResearchEnabled={isDeepResearchEnabled}
                isThinkingEnabled={isThinkingEnabled}
                models={models}
                onDeepResearchChange={onDeepResearchChange}
                onSelectedModelChange={onSelectedModelChange}
                onStop={onStop}
                onThinkingChange={onThinkingChange}
                selectedModel={selectedModel}
                selectedModelId={selectedModelId}
                showContextBadge={showContextBadge}
                supportsNativeFiles={supportsNativeFiles}
                supportsImages={supportsImages}
                toolbarSlot={toolbarSlot}
                hasContent={hasContent}
            />
        </form>
    );
}
