import { useState, useMemo } from "react";
import type { ConversationSummary } from "../types";
import { Link, useNavigate } from "@tanstack/react-router";
import {
    PlusIcon,
    SignInIcon,
    UserPlusIcon,
    XIcon,
    SidebarSimpleIcon,
    DotsThreeVerticalIcon,
    StarIcon,
    PencilSimpleIcon,
    TrashIcon,
    GearSixIcon,
    SignOutIcon
} from "@phosphor-icons/react";
import {
    Menu,
    MenuContent,
    MenuItem,
    MenuSeparator,
    MenuTrigger
} from "@/components/ui";
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

type TimeGroup = "Today" | "Yesterday" | "This week" | "This month" | "Older";

function getTimeGroup(dateStr: string): TimeGroup {
    const now = new Date();
    const date = new Date(dateStr);
    const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(startOfMonth.getDate() - 30);

    if (date >= startOfToday) return "Today";
    if (date >= startOfYesterday) return "Yesterday";
    if (date >= startOfWeek) return "This week";
    if (date >= startOfMonth) return "This month";
    return "Older";
}

const TIME_GROUP_ORDER: TimeGroup[] = [
    "Today",
    "Yesterday",
    "This week",
    "This month",
    "Older"
];

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
    const { conversations, conversationsError, isLoadingConversations } =
        useChat();
    const { isAuthenticated, isLoading, logout, user } = useAuth();
    const navigate = useNavigate();
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const groupedConversations = useMemo(() => {
        const groups = new Map<TimeGroup, ConversationSummary[]>();
        for (const c of conversations) {
            const group = getTimeGroup(c.lastMessageAt);
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group)!.push(c);
        }
        return TIME_GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({
            label: g,
            items: groups.get(g)!
        }));
    }, [conversations]);

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

    function handleNewChat() {
        onNewChat?.();
        void navigate({ to: "/" });
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
                        "flex items-center gap-1 overflow-hidden transition-opacity duration-200 hover:opacity-90 cursor-pointer",
                        collapsed ? "w-0 opacity-0" : "opacity-100"
                    )}
                    onClick={() => navigate({ to: "/" })}
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

            <div className="px-2 pb-2">
                {collapsed ? (
                    <button
                        type="button"
                        onClick={handleNewChat}
                        className="mx-auto flex size-8 items-center justify-center rounded-md text-dark-300 transition hover:bg-dark-700 hover:text-white"
                    >
                        <PlusIcon className="size-4" weight="bold" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleNewChat}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-dark-200 transition hover:bg-dark-700 hover:text-white"
                    >
                        <PlusIcon className="size-4 shrink-0" weight="bold" />
                        <span>New chat</span>
                    </button>
                )}
            </div>

            {!collapsed && (
                <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    <div>
                        {isLoadingConversations ? (
                            <div className="px-3 py-2 text-sm text-dark-200">
                                Loading conversations...
                            </div>
                        ) : null}

                        {!isLoadingConversations && conversationsError ? (
                            <div className="px-3 py-2 text-sm text-red-200">
                                {conversationsError}
                            </div>
                        ) : null}

                        {groupedConversations.map(({ label, items }) => (
                            <div key={label} className="mb-3">
                                <div className="px-2 py-2 text-xs font-medium text-dark-200">
                                    {label}
                                </div>
                                <div className="space-y-0.5">
                                    {items.map((conversation) => {
                                        const isActive =
                                            currentPath ===
                                            `/conversations/${conversation.id}`;

                                        return (
                                            <div
                                                key={conversation.id}
                                                className={cn(
                                                    "group relative flex items-center rounded-md transition-colors",
                                                    isActive
                                                        ? "bg-dark-700 text-white"
                                                        : "text-dark-200 hover:bg-dark-700 hover:text-white"
                                                )}
                                            >
                                                <Link
                                                    to="/conversations/$conversationId"
                                                    params={{
                                                        conversationId:
                                                            conversation.id
                                                    }}
                                                    onClick={handleNavigate}
                                                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-sm"
                                                >
                                                    <span className="min-w-0 flex-1 truncate text-inherit">
                                                        {conversation.title}
                                                    </span>
                                                    {conversation.hasUnreadAssistantReply ? (
                                                        <span className="size-1.5 shrink-0 rounded-full bg-sky-400" />
                                                    ) : null}
                                                </Link>

                                                <Menu>
                                                    <MenuTrigger
                                                        className={cn(
                                                            "mr-1 shrink-0 rounded-md p-1 text-dark-200 transition-all hover:bg-dark-600 hover:text-white focus:outline-none",
                                                            isActive
                                                                ? "opacity-100"
                                                                : "opacity-0 group-hover:opacity-100"
                                                        )}
                                                        onClick={(e) =>
                                                            e.preventDefault()
                                                        }
                                                    >
                                                        <DotsThreeVerticalIcon
                                                            className="size-4"
                                                            weight="bold"
                                                        />
                                                    </MenuTrigger>
                                                    <MenuContent
                                                        side="right"
                                                        align="start"
                                                        sideOffset={4}
                                                    >
                                                        <MenuItem
                                                            onClick={() => {}}
                                                        >
                                                            <StarIcon className="size-4" />
                                                            Favorite
                                                        </MenuItem>
                                                        <MenuItem
                                                            onClick={() => {}}
                                                        >
                                                            <PencilSimpleIcon className="size-4" />
                                                            Rename
                                                        </MenuItem>
                                                        <MenuSeparator />
                                                        <MenuItem
                                                            onClick={() => {}}
                                                            destructive
                                                        >
                                                            <TrashIcon className="size-4" />
                                                            Delete
                                                        </MenuItem>
                                                    </MenuContent>
                                                </Menu>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </nav>
            )}

            <div className="mt-auto border-t border-dark-600 p-2">
                {isLoading ? (
                    <div className="px-3 py-2 text-sm text-dark-200">
                        {collapsed ? "..." : "Loading..."}
                    </div>
                ) : isAuthenticated && user ? (
                    <Menu>
                        <MenuTrigger
                            className={cn(
                                "w-full rounded-md transition hover:bg-dark-700",
                                collapsed
                                    ? "flex justify-center p-1"
                                    : "block p-1"
                            )}
                        >
                            <div
                                className={cn(
                                    "flex items-center",
                                    collapsed ? "justify-center" : "gap-3"
                                )}
                            >
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-dark-600 text-sm font-semibold text-dark-50">
                                    {initials}
                                </div>

                                {!collapsed && (
                                    <div className="min-w-0 flex-1 text-left">
                                        <div className="truncate text-sm text-white">
                                            {displayName}
                                        </div>
                                        <div className="truncate text-xs text-dark-200">
                                            {user.email}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </MenuTrigger>

                        <MenuContent align="end" side="top">
                            <MenuItem onClick={handleNavigate}>
                                <GearSixIcon className="size-4" />
                                <Link to="/settings">Settings</Link>
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem
                                onClick={handleLogout}
                                disabled={isLoggingOut}
                                destructive
                            >
                                <SignOutIcon className="size-4" />
                                {isLoggingOut ? "Logging out..." : "Logout"}
                            </MenuItem>
                        </MenuContent>
                    </Menu>
                ) : collapsed ? (
                    <div className="flex flex-col items-center gap-2">
                        <Link
                            to="/login"
                            onClick={handleNavigate}
                            className="flex size-10 items-center justify-center rounded-lg text-dark-200 transition hover:bg-white/5 hover:text-white"
                            title="Login"
                        >
                            <SignInIcon className="size-4" weight="bold" />
                        </Link>
                        <Link
                            to="/register"
                            onClick={handleNavigate}
                            className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-dark-900 transition hover:bg-primary-300"
                            title="Register"
                        >
                            <UserPlusIcon className="size-4" weight="bold" />
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <Link
                            to="/login"
                            onClick={handleNavigate}
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-dark-400 px-2.5 py-1.5 text-sm text-white transition hover:bg-dark-600"
                        >
                            <SignInIcon className="size-4" weight="bold" />
                            Login
                        </Link>

                        <Link
                            to="/register"
                            onClick={handleNavigate}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary-50 px-2.5 py-1.5 text-sm text-dark-900 transition hover:bg-primary-200"
                        >
                            <UserPlusIcon className="size-4" weight="bold" />
                            Register
                        </Link>
                    </div>
                )}
            </div>
        </aside>
    );
}
