import {
    useState,
    useEffect,
    useLayoutEffect,
    useRef,
    type ReactNode
} from "react";
import { cn } from "@/lib/cn";
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

            <ChatInput {...chatInputProps} className={className} />
        </div>
    );
}
