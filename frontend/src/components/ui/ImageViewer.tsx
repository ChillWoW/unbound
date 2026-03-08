import { useState, useEffect, useCallback } from "react";
import { XIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

interface ImageViewerProps {
    src: string;
    alt: string;
    imgClassName?: string;
}

export function ImageViewer({ src, alt, imgClassName }: ImageViewerProps) {
    const [open, setOpen] = useState(false);

    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, close]);

    return (
        <>
            <span className="group relative inline-block max-w-full">
                <img
                    src={src}
                    alt={alt}
                    className={cn(
                        "cursor-zoom-in rounded-md border border-dark-600 object-contain",
                        imgClassName ?? "max-h-64 w-auto max-w-full"
                    )}
                    onClick={() => setOpen(true)}
                />
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="absolute right-1.5 top-1.5 flex items-center justify-center rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="View full size"
                >
                    <ArrowsOutIcon className="size-3.5 text-white" />
                </button>
            </span>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onClick={close}
                >
                    <button
                        type="button"
                        onClick={close}
                        className="absolute right-4 top-4 flex items-center justify-center rounded-full bg-dark-800 p-2 text-dark-200 transition-colors hover:bg-dark-700 hover:text-dark-50"
                        aria-label="Close"
                    >
                        <XIcon className="size-5" />
                    </button>
                    <img
                        src={src}
                        alt={alt}
                        className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}
