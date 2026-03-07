import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
    PlusIcon,
    SignIn,
    SignOut,
    UserPlus,
    XIcon,
    SidebarSimpleIcon
} from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";
import { cn } from "@/lib/cn";
import { useChat } from "../chat-context";
import { getUserInitials } from "../utils/get-user-initials";

interface ChatSidebarProps {
    className?: string;
    currentPath: string;
    /** Mobile mode: called when the sidebar should close */
    onClose?: () => void;
    onNewChat?: () => void;
    /** If true, sidebar is being shown inside a mobile overlay */
    isMobile?: boolean;
    /** Desktop collapsed state (controlled by parent) */
    isCollapsed?: boolean;
    /** Called when the toggle button is clicked on desktop */
    onToggleCollapse?: () => void;
}

function getDisplayName(
    name: string | null | undefined,
    email: string | undefined
) {
    const trimmedName = name?.trim();

    if (trimmedName) return trimmedName;
    if (!email) return "Guest";

    return email.split("@")[0];
}

export function ChatSidebar({
    className,
    currentPath,
    onClose,
    onNewChat,
    isMobile = false,
    isCollapsed: isCollapsedProp = false,
    onToggleCollapse
}: ChatSidebarProps) {
    const { conversations } = useChat();
    const { isAuthenticated, isLoading, logout, user } = useAuth();
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const initials = getUserInitials(user?.name ?? user?.email);
    const displayName = getDisplayName(user?.name, user?.email);

    const collapsed = !isMobile && isCollapsedProp;

    function handleToggle() {
        if (isMobile) {
            onClose?.();
        } else {
            onToggleCollapse?.();
        }
    }

    function handleNavigate() {
        if (isMobile) {
            onClose?.();
        }
    }

    async function handleLogout() {
        setIsLoggingOut(true);

        try {
            await logout();
            handleNavigate();
        } finally {
            setIsLoggingOut(false);
        }
    }

    return (
        <aside
            className={cn(
                "flex h-full flex-col border-r border-dark-600 bg-dark-800 text-white transition-[width] duration-200 ease-out",
                collapsed ? "w-14" : "w-full",
                className
            )}
        >
            <div className="flex items-center justify-between p-2">
                <div
                    className={cn(
                        "flex items-center gap-1 overflow-hidden transition-opacity duration-200",
                        collapsed ? "w-0 opacity-0" : "opacity-100"
                    )}
                >
                    <img
                        src="/logos/logo.svg"
                        alt="Logo"
                        className="size-10 shrink-0"
                    />
                    <span className="whitespace-nowrap text-sm font-semibold text-white">
                        Unbound
                    </span>
                </div>

                <button
                    type="button"
                    onClick={handleToggle}
                    className={cn(
                        "inline-flex shrink-0 items-center justify-center rounded-md text-dark-100 transition hover:bg-dark-600 hover:text-white",
                        collapsed ? "mx-auto size-8" : "size-8"
                    )}
                >
                    {isMobile ? (
                        <XIcon className="size-4" weight="bold" />
                    ) : collapsed ? (
                        <SidebarSimpleIcon className="size-4" weight="bold" />
                    ) : (
                        <SidebarSimpleIcon className="size-4" weight="fill" />
                    )}
                </button>
            </div>

            <div className="p-2">
                {collapsed ? (
                    <button
                        type="button"
                        onClick={onNewChat}
                        className="mx-auto flex size-8 items-center justify-center rounded-md text-dark-100 transition hover:bg-dark-600 hover:text-white"
                    >
                        <PlusIcon className="size-4" weight="bold" />
                    </button>
                ) : (
                    <Button
                        variant="ghost"
                        className="group w-full justify-start gap-2 text-dark-100 hover:text-white"
                        onClick={onNewChat}
                    >
                        <PlusIcon className="size-4" weight="bold" />
                        <span>New chat</span>
                    </Button>
                )}
            </div>

            {!collapsed && (
                <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    <div className="space-y-1">
                        {conversations.map((conversation) => {
                            const isActive =
                                currentPath ===
                                `/conversations/${conversation.id}`;

                            return (
                                <Link
                                    key={conversation.id}
                                    to="/conversations/$conversationId"
                                    params={{ conversationId: conversation.id }}
                                    onClick={handleNavigate}
                                    title={
                                        collapsed
                                            ? conversation.title
                                            : undefined
                                    }
                                    className={cn(
                                        "block rounded-md transition px-3 py-2 text-sm",
                                        isActive
                                            ? "bg-dark-600 text-white"
                                            : "text-dark-100 hover:bg-dark-600 hover:text-white"
                                    )}
                                >
                                    <span className="block truncate">
                                        {conversation.title}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>
            )}

            <div className="mt-auto border-t border-dark-600 p-2">
                {isLoading ? (
                    <div className="px-3 py-2 text-sm text-dark-200">
                        {collapsed ? "..." : "Loading..."}
                    </div>
                ) : isAuthenticated && user ? (
                    <div className="flex flex-col gap-2">
                        <div
                            className={cn(
                                "flex items-center rounded-md py-2",
                                collapsed ? "justify-center px-0" : "gap-3 px-1"
                            )}
                        >
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-dark-600 text-sm font-semibold text-dark-50">
                                {initials}
                            </div>

                            {!collapsed && (
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm text-white">
                                        {displayName}
                                    </div>
                                    <div className="truncate text-xs text-dark-200">
                                        {user.email}
                                    </div>
                                </div>
                            )}
                        </div>

                        {collapsed ? (
                            <Button
                                variant="ghost"
                                className="size-8 p-0 mx-auto text-dark-100 hover:text-white"
                                onClick={handleLogout}
                            >
                                <SignOut className="size-4" weight="bold" />
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-2"
                                disabled={isLoggingOut}
                                onClick={handleLogout}
                            >
                                <SignOut className="size-4" weight="bold" />
                                <span>
                                    {isLoggingOut
                                        ? "Signing out..."
                                        : "Log out"}
                                </span>
                            </Button>
                        )}
                    </div>
                ) : collapsed ? (
                    <div className="flex flex-col items-center gap-2">
                        <Link
                            to="/login"
                            onClick={handleNavigate}
                            className="flex size-10 items-center justify-center rounded-lg text-dark-200 transition hover:bg-white/5 hover:text-white"
                            title="Login"
                        >
                            <SignIn className="size-4" weight="bold" />
                        </Link>
                        <Link
                            to="/register"
                            onClick={handleNavigate}
                            className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-dark-900 transition hover:bg-primary-300"
                            title="Register"
                        >
                            <UserPlus className="size-4" weight="bold" />
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <Link
                            to="/login"
                            onClick={handleNavigate}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/5"
                        >
                            <SignIn className="size-4" weight="bold" />
                            Login
                        </Link>

                        <Link
                            to="/register"
                            onClick={handleNavigate}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-sm text-dark-900 transition hover:bg-primary-300"
                        >
                            <UserPlus className="size-4" weight="bold" />
                            Register
                        </Link>
                    </div>
                )}
            </div>
        </aside>
    );
}
