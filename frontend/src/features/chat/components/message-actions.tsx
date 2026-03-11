import { useCallback, useEffect, useRef, useState } from "react";
import {
    CaretLeftIcon,
    CaretRightIcon,
    CheckIcon,
    CopyIcon
} from "@phosphor-icons/react";
import { Button, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ConversationMessage } from "../types";
import { getSiblingInfo, type MessageChildrenMap } from "../utils/message-tree";

export function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
    }, [text]);

    return (
        <Tooltip content={copied ? "Copied!" : "Copy"} side="top">
            <button
                type="button"
                onClick={handleCopy}
                className="flex size-7 items-center justify-center rounded-md text-dark-300 transition-colors hover:bg-dark-700 hover:text-dark-50"
            >
                {copied ? (
                    <CheckIcon className="size-3.5" weight="bold" />
                ) : (
                    <CopyIcon className="size-3.5" weight="bold" />
                )}
            </button>
        </Tooltip>
    );
}

export function BranchNavigator({
    tree,
    message,
    onSelect
}: {
    tree: MessageChildrenMap;
    message: ConversationMessage;
    onSelect: (parentKey: string | null, messageId: string) => void;
}) {
    const { siblings, activeIndex, total } = getSiblingInfo(tree, message);

    if (total <= 1) return null;

    const canGoLeft = activeIndex > 0;
    const canGoRight = activeIndex < total - 1;
    const parentKey = message.parentMessageId ?? null;

    return (
        <div className="flex items-center gap-0.5 text-[11px] text-dark-300">
            <button
                type="button"
                disabled={!canGoLeft}
                onClick={() =>
                    canGoLeft &&
                    onSelect(parentKey, siblings[activeIndex - 1].id)
                }
                className="flex size-5 items-center justify-center rounded-md transition-colors hover:text-dark-50 disabled:opacity-30 disabled:hover:text-dark-300"
            >
                <CaretLeftIcon className="size-3" weight="bold" />
            </button>
            <span className="tabular-nums min-w-[2ch] text-center">
                {activeIndex + 1}/{total}
            </span>
            <button
                type="button"
                disabled={!canGoRight}
                onClick={() =>
                    canGoRight &&
                    onSelect(parentKey, siblings[activeIndex + 1].id)
                }
                className="flex size-5 items-center justify-center rounded transition-colors hover:text-dark-50 disabled:opacity-30 disabled:hover:text-dark-300"
            >
                <CaretRightIcon className="size-3" weight="bold" />
            </button>
        </div>
    );
}

export function InlineEditForm({
    initialText,
    onSave,
    onCancel,
    isSending
}: {
    initialText: string;
    onSave: (text: string) => void;
    onCancel: () => void;
    isSending: boolean;
}) {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = textareaRef.current;
        if (el) {
            setText(el.value);
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        }
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (text.trim()) onSave(text.trim());
        }
        if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div className="w-full">
            <textarea
                ref={textareaRef}
                defaultValue={initialText}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                rows={Math.min(12, Math.max(2, text.split("\n").length))}
                className="w-full resize-none rounded-md border border-dark-600 bg-dark-900 px-3 py-2 text-sm leading-6 text-dark-50 outline-none focus:border-primary-500"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                    variant="ghost"
                    onClick={onCancel}
                    disabled={isSending}
                    className="text-dark-200 hover:text-dark-50"
                    size="sm"
                >
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    onClick={() => text.trim() && onSave(text.trim())}
                    disabled={isSending || !text.trim()}
                    size="sm"
                >
                    Save & Submit
                </Button>
            </div>
        </div>
    );
}
