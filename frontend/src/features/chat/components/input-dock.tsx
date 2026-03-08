import {
    useState,
    useEffect,
    useLayoutEffect,
    useRef,
    type ReactNode
} from "react";
import { cn } from "@/lib/cn";
import { Button, Tooltip } from "@/components/ui";
import { ChatInput, type ChatInputProps } from "./chat-input";

export interface DockPanel {
    id: string;
    label: string;
    icon: ReactNode;
    content: ReactNode;
}

interface InputDockProps extends ChatInputProps {
    panels?: DockPanel[];
    className?: string;
}

export function InputDock({
    panels = [],
    className,
    ...chatInputProps
}: InputDockProps) {
    const [activePanelId, setActivePanelId] = useState<string | null>(null);
    const [renderedPanelId, setRenderedPanelId] = useState<string | null>(null);
    const [measuredHeight, setMeasuredHeight] = useState(0);

    const innerRef = useRef<HTMLDivElement>(null);
    const closingTimeoutRef = useRef<number | null>(null);

    const isOpen = activePanelId !== null;

    function measure() {
        const el = innerRef.current;
        if (!el) return;
        setMeasuredHeight(el.scrollHeight);
    }

    function clearClosingTimeout() {
        if (closingTimeoutRef.current !== null) {
            window.clearTimeout(closingTimeoutRef.current);
            closingTimeoutRef.current = null;
        }
    }

    function togglePanel(id: string) {
        clearClosingTimeout();

        setActivePanelId((prev) => {
            if (prev === id) {
                return null;
            }

            setRenderedPanelId(id);
            return id;
        });
    }

    useLayoutEffect(() => {
        if (activePanelId) {
            setRenderedPanelId(activePanelId);
        }
    }, [activePanelId]);

    useLayoutEffect(() => {
        measure();
    }, [renderedPanelId, panels]);

    useEffect(() => {
        const el = innerRef.current;
        if (!el) return;

        const ro = new ResizeObserver(() => {
            setMeasuredHeight(el.scrollHeight);
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        clearClosingTimeout();

        if (!isOpen && renderedPanelId) {
            closingTimeoutRef.current = window.setTimeout(() => {
                setRenderedPanelId(null);
                closingTimeoutRef.current = null;
            }, 300);
        }

        return clearClosingTimeout;
    }, [isOpen, renderedPanelId]);

    const panelToggles =
        panels.length > 0 ? (
            <div className="flex items-center gap-0.5">
                {panels.map((panel) => {
                    const isActive = activePanelId === panel.id;

                    return (
                        <Tooltip
                            key={panel.id}
                            content={panel.label}
                            side="top"
                        >
                            <Button
                                type="button"
                                variant="ghost"
                                className={cn(
                                    "size-8 p-0 transition-colors",
                                    isActive
                                        ? "text-primary-400 bg-primary-500/10 hover:bg-primary-500/15 hover:text-primary-300"
                                        : "text-dark-200 hover:text-white"
                                )}
                                onClick={() => togglePanel(panel.id)}
                            >
                                {panel.icon}
                            </Button>
                        </Tooltip>
                    );
                })}
            </div>
        ) : null;

    return (
        <div className="flex flex-col">
            <div
                className="mx-2 overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={{ height: isOpen ? measuredHeight : 0 }}
                aria-hidden={!isOpen}
            >
                <div
                    className={cn(
                        "rounded-t-md border border-b-0 border-dark-600 bg-dark-800 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                        isOpen
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-2 pointer-events-none"
                    )}
                >
                    <div ref={innerRef}>
                        {panels.map((panel) => (
                            <div
                                key={panel.id}
                                className={
                                    renderedPanelId === panel.id
                                        ? "block"
                                        : "hidden"
                                }
                            >
                                {panel.content}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <ChatInput
                {...chatInputProps}
                toolbarSlot={panelToggles}
                className={className}
            />
        </div>
    );
}
