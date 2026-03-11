import { Tooltip as Base } from "@base-ui/react";
import { cn } from "@/lib/cn";
import { type ReactNode, isValidElement } from "react";

interface TooltipProps {
    children: ReactNode;
    content: ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    sideOffset?: number;
    align?: "start" | "center" | "end";
    delay?: number;
    disabled?: boolean;
    className?: string;
}

export function Tooltip({
    children,
    content,
    side = "top",
    sideOffset = 6,
    align = "center",
    delay = 0,
    disabled = false,
    className
}: TooltipProps) {
    if (disabled) return children;

    return (
        <Base.Provider>
            <Base.Root>
                <Base.Trigger
                    {...(typeof delay === "number" ? { delay } : {})}
                    render={isValidElement(children) ? children : undefined}
                >
                    {!isValidElement(children) && children}
                </Base.Trigger>

                <Base.Portal>
                    <Base.Positioner
                        sideOffset={sideOffset}
                        side={side}
                        align={align}
                        className="z-10"
                    >
                        <Base.Popup
                            className={cn(
                                "bg-dark-850 border border-dark-600 text-dark-50 shadow-sm rounded-md px-2 py-0.5 text-xs",
                                "animate-in fade-in-0 zoom-in-95 duration-150 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95",
                                className
                            )}
                        >
                            {content}
                        </Base.Popup>
                    </Base.Positioner>
                </Base.Portal>
            </Base.Root>
        </Base.Provider>
    );
}
