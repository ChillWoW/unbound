import {
    ArrowSquareOutIcon,
    ClockIcon,
    FileTextIcon,
    PencilSimpleIcon
} from "@phosphor-icons/react";
import { ImageViewer, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
    ConversationMessage,
    FileMessagePart,
    ImageMessagePart,
    MessageMetadata
} from "../types";
import { BranchNavigator, CopyButton, InlineEditForm } from "./message-actions";
import {
    createAttachmentUrl,
    createMessagePartKey,
    formatBytes,
    formatTime,
    getAttachmentName,
    getMessageText
} from "./message-utils";
import type { MessageChildrenMap } from "../utils/message-tree";

function MessageFileCard({ part }: { part: FileMessagePart }) {
    const href = createAttachmentUrl(part);
    const size = formatBytes(part.size);

    return (
        <a
            href={href}
            download={getAttachmentName(part)}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-3 rounded-md border border-dark-600 bg-dark-850 px-2.5 py-1.5 text-left transition-colors hover:border-dark-500 hover:bg-dark-800"
        >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-dark-700 text-dark-100">
                <FileTextIcon className="size-4.5" weight="bold" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-dark-50">
                    {getAttachmentName(part)}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-dark-300">
                    <span>{part.mimeType}</span>
                    {size ? <span>{size}</span> : null}
                </div>
            </div>
            <ArrowSquareOutIcon
                className="size-4 shrink-0 text-dark-200"
                weight="bold"
            />
        </a>
    );
}

function UserMessageMetadataDisplay({
    metadata,
    createdAt
}: {
    metadata: MessageMetadata | null;
    createdAt: string;
}) {
    const sentAt =
        typeof metadata?.sentAt === "string" ? metadata.sentAt : createdAt;
    const time = formatTime(sentAt);

    if (!time) return null;

    return (
        <div className="flex items-center gap-1.5 text-[11px] text-dark-300">
            <ClockIcon className="size-3" weight="bold" />
            <span>{time}</span>
        </div>
    );
}

export function UserMessage({
    message,
    tree,
    onBranchSelect,
    isEditing,
    onEditStart,
    onEditSave,
    onEditCancel,
    isSending
}: {
    message: ConversationMessage;
    tree: MessageChildrenMap;
    onBranchSelect: (parentKey: string | null, messageId: string) => void;
    isEditing: boolean;
    onEditStart: () => void;
    onEditSave: (text: string) => void;
    onEditCancel: () => void;
    isSending: boolean;
}) {
    const text = getMessageText(message.parts);
    const images = message.parts.filter(
        (p): p is ImageMessagePart => p.type === "image"
    );
    const files = message.parts.filter(
        (p): p is FileMessagePart => p.type === "file"
    );

    return (
        <div className="flex justify-end">
            <div
                className={cn(
                    isEditing ? "w-full max-w-[85%]" : "max-w-[75%]"
                )}
            >
                {isEditing ? (
                    <InlineEditForm
                        initialText={text ?? ""}
                        onSave={onEditSave}
                        onCancel={onEditCancel}
                        isSending={isSending}
                    />
                ) : (
                    <>
                        {images.length > 0 && (
                            <div className="flex flex-wrap justify-end gap-2.5 mb-1">
                                {images.map((img, i) => (
                                    <ImageViewer
                                        key={createMessagePartKey(
                                            message.id,
                                            img,
                                            i
                                        )}
                                        src={createAttachmentUrl(img)}
                                        alt={getAttachmentName(img)}
                                        imgClassName="max-h-32 w-auto max-w-full rounded-md"
                                    />
                                ))}
                            </div>
                        )}
                        {files.length > 0 && (
                            <div className="mb-1 space-y-2">
                                {files.map((file, index) => (
                                    <MessageFileCard
                                        key={createMessagePartKey(
                                            message.id,
                                            file,
                                            index
                                        )}
                                        part={file}
                                    />
                                ))}
                            </div>
                        )}
                        {text && (
                            <div className="rounded-md border border-dark-600 bg-dark-850 px-3 py-0.5">
                                <p className="whitespace-pre-wrap text-sm leading-6 text-dark-50">
                                    {text}
                                </p>
                            </div>
                        )}
                        {!text && images.length === 0 && files.length === 0 && (
                            <div className="rounded-md border border-dark-600 bg-dark-850 px-3 py-0.5">
                                <p className="whitespace-pre-wrap text-sm leading-6 text-dark-50">
                                    Unsupported message part.
                                </p>
                            </div>
                        )}
                        <div className="mt-1.5 flex items-center justify-end gap-1.5">
                            {text && <CopyButton text={text} />}
                            {!isSending && text && (
                                <Tooltip content="Edit" side="top">
                                    <button
                                        type="button"
                                        onClick={onEditStart}
                                        className="flex size-7 items-center justify-center rounded-md text-dark-300 transition-colors hover:bg-dark-700 hover:text-dark-50"
                                    >
                                        <PencilSimpleIcon
                                            className="size-3.5"
                                            weight="bold"
                                        />
                                    </button>
                                </Tooltip>
                            )}
                            <BranchNavigator
                                tree={tree}
                                message={message}
                                onSelect={onBranchSelect}
                            />
                            <UserMessageMetadataDisplay
                                metadata={message.metadata}
                                createdAt={message.createdAt}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
