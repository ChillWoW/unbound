import { useEffect, useRef, useState } from "react";
import { BrainIcon, CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import type { ReasoningMessagePart } from "../types";

export function ReasoningDisplay({
    part,
    isStreaming
}: {
    part: ReasoningMessagePart;
    isStreaming: boolean;
}) {
    const [expanded, setExpanded] = useState(true);
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
    const reasoningScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isStreaming) setExpanded(false);
    }, [isStreaming]);

    useEffect(() => {
        const el = reasoningScrollRef.current;
        if (!el) return;

        const check = () => {
            setIsScrolledToBottom(
                el.scrollHeight - el.scrollTop - el.clientHeight < 4
            );
        };

        check();
        el.addEventListener("scroll", check, { passive: true });
        return () => el.removeEventListener("scroll", check);
    }, [expanded, part.text]);

    useEffect(() => {
        if (!expanded || !isStreaming) return;

        const el = reasoningScrollRef.current;
        if (!el) return;

        const frame = requestAnimationFrame(() => {
            el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
            setIsScrolledToBottom(true);
        });

        return () => cancelAnimationFrame(frame);
    }, [expanded, isStreaming, part.text]);

    return (
        <div className="my-2">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className={cn(
                    "flex items-center gap-1.5 text-xs text-dark-200 transition-colors",
                    !isStreaming && "hover:text-dark-50"
                )}
            >
                <BrainIcon
                    className="size-3.5 shrink-0"
                    weight="fill"
                />
                <span className={cn("font-medium", isStreaming && "wave-text")}>
                    Thinking
                </span>
                <CaretRightIcon
                    className={cn(
                        "size-3 transition-transform",
                        expanded && "rotate-90"
                    )}
                    weight="bold"
                />
            </button>
            {expanded && (
                <div className="relative mt-2">
                    <div
                        ref={reasoningScrollRef}
                        className="max-h-72 overflow-y-auto"
                        style={{
                            maskImage: isScrolledToBottom
                                ? undefined
                                : "linear-gradient(to bottom, black 70%, transparent 100%)",
                            WebkitMaskImage: isScrolledToBottom
                                ? undefined
                                : "linear-gradient(to bottom, black 70%, transparent 100%)"
                        }}
                    >
                        <p className="whitespace-pre-wrap text-xs leading-5 text-dark-300">
                            {part.text}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
