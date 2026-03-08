import { useEffect, useState, type PropsWithChildren } from "react";
import { useRouterState } from "@tanstack/react-router";
import { SidebarSimpleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { ChatSidebar } from "./chat-sidebar";
import { Button } from "@/components/ui";

export function ChatShell({ children }: PropsWithChildren) {
    const pathname = useRouterState({
        select: (state) => state.location.pathname
    });
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

    useEffect(() => {
        setIsMobileSidebarOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!isMobileSidebarOpen) return;

        const previousOverflow = document.body.style.overflow;

        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsMobileSidebarOpen(false);
            }
        }

        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleEscape);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isMobileSidebarOpen]);

    return (
        <div className="flex h-screen overflow-hidden bg-dark-900 text-white">
            <div
                className={cn(
                    "hidden shrink-0 transition-[width] duration-200 ease-out lg:block",
                    isDesktopCollapsed ? "w-[60px]" : "w-[312px]"
                )}
            >
                <div
                    className={cn(
                        "fixed inset-y-0 left-0 transition-[width] duration-200 ease-out",
                        isDesktopCollapsed ? "w-[60px]" : "w-[312px]"
                    )}
                >
                    <ChatSidebar
                        currentPath={pathname}
                        isCollapsed={isDesktopCollapsed}
                        onToggleCollapse={() =>
                            setIsDesktopCollapsed((prev) => !prev)
                        }
                    />
                </div>
            </div>

            <div
                className={cn(
                    "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition md:hidden",
                    isMobileSidebarOpen
                        ? "pointer-events-auto opacity-100"
                        : "pointer-events-none opacity-0"
                )}
                onClick={() => setIsMobileSidebarOpen(false)}
            />

            <div
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-[calc(100vw-3rem)] max-w-[312px] transition-transform duration-200 ease-out md:hidden",
                    isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="flex h-full flex-col">
                    <ChatSidebar
                        currentPath={pathname}
                        isMobile
                        onClose={() => setIsMobileSidebarOpen(false)}
                        onNewChat={() => setIsMobileSidebarOpen(false)}
                    />
                </div>
            </div>

            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                <header className="sticky top-0 z-20 flex items-center md:hidden p-2">
                    <Button
                        variant="ghost"
                        className="text-dark-100"
                        onClick={() => setIsMobileSidebarOpen(true)}
                    >
                        <SidebarSimpleIcon className="size-5" weight="bold" />
                    </Button>
                </header>

                <div className="relative flex-1 overflow-hidden">
                    {children}
                </div>
            </div>
        </div>
    );
}
