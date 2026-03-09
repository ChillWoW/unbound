import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationSummary } from "../types";
import { Link, useNavigate } from "@tanstack/react-router";
import {
    DotsThreeVerticalIcon,
    GearSixIcon,
    MinusIcon,
    PencilSimpleIcon,
    PlusIcon,
    SidebarSimpleIcon,
    SignInIcon,
    SignOutIcon,
    StarIcon,
    TrashIcon,
    UserPlusIcon,
    XIcon
} from "@phosphor-icons/react";
import {
    Button,
    Input,
    Menu,
    MenuContent,
    MenuItem,
    MenuSeparator,
    MenuTrigger,
    Modal,
    ModalContent,
    ModalDescription,
    ModalTitle,
    Tooltip
} from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";
import { cn } from "@/lib/cn";
import { notify } from "@/lib/toast";
import { useChat } from "../chat-context";
import { getUserInitials } from "../utils/get-user-initials";

interface ChatSidebarProps {
    className?: string;
    currentPath: string;
    onClose?: () => void;
    onNewChat?: () => void;
    isMobile?: boolean;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

interface ConversationActionsMenuProps {
    conversation: ConversationSummary;
    isActive: boolean;
    onDeleteRequest: (conversation: ConversationSummary) => void;
    onRename: (conversationId: string, title: string) => Promise<void>;
    onToggleFavorite: (
        conversationId: string,
        isFavorite: boolean
    ) => Promise<void>;
}

interface ConversationListItemProps {
    conversation: ConversationSummary;
    currentPath: string;
    isGenerating: boolean;
    onDeleteRequest: (conversation: ConversationSummary) => void;
    onNavigate: () => void;
    onRename: (conversationId: string, title: string) => Promise<void>;
    onToggleFavorite: (
        conversationId: string,
        isFavorite: boolean
    ) => Promise<void>;
}

type TimeGroup = "Today" | "Yesterday" | "This week" | "This month" | "Older";

const TIME_GROUP_ORDER: TimeGroup[] = [
    "Today",
    "Yesterday",
    "This week",
    "This month",
    "Older"
];

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

function getDisplayName(
    name: string | null | undefined,
    email: string | undefined
) {
    const trimmedName = name?.trim();

    if (trimmedName) return trimmedName;
    if (!email) return "Guest";

    return email.split("@")[0];
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return "Something went wrong. Please try again.";
}

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function BrailleSpinner({ className }: { className?: string }) {
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        const id = setInterval(
            () => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length),
            80
        );
        return () => clearInterval(id);
    }, []);

    return <span className={className}>{BRAILLE_FRAMES[frame]}</span>;
}

function ConversationActionsMenu({
    conversation,
    isActive,
    onDeleteRequest,
    onRename,
    onToggleFavorite
}: ConversationActionsMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(conversation.title);
    const [renameError, setRenameError] = useState<string | null>(null);
    const [menuError, setMenuError] = useState<string | null>(null);
    const [isRenamingPending, setIsRenamingPending] = useState(false);
    const [isFavoritePending, setIsFavoritePending] = useState(false);
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) {
            setIsRenaming(false);
            setRenameError(null);
            setMenuError(null);
            setRenameValue(conversation.title);
        }
    }, [conversation.title, isOpen]);

    useEffect(() => {
        if (!isRenaming) {
            return;
        }

        const frame = requestAnimationFrame(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        });

        return () => cancelAnimationFrame(frame);
    }, [isRenaming]);

    async function handleFavoriteToggle() {
        setMenuError(null);
        setIsFavoritePending(true);

        try {
            await onToggleFavorite(conversation.id, !conversation.isFavorite);
            setIsOpen(false);
        } catch (error) {
            setMenuError(toErrorMessage(error));
        } finally {
            setIsFavoritePending(false);
        }
    }

    async function handleRenameSubmit() {
        setRenameError(null);
        const normalizedTitle = renameValue.replace(/\s+/g, " ").trim();

        if (!normalizedTitle) {
            setRenameError("Title cannot be empty.");
            return;
        }

        if (normalizedTitle === conversation.title) {
            setIsOpen(false);
            return;
        }

        setIsRenamingPending(true);

        try {
            await onRename(conversation.id, normalizedTitle);
            setIsOpen(false);
        } catch (error) {
            setRenameError(toErrorMessage(error));
        } finally {
            setIsRenamingPending(false);
        }
    }

    function handleRenameCancel() {
        setIsRenaming(false);
        setRenameError(null);
        setRenameValue(conversation.title);
    }

    return (
        <Menu open={isOpen} onOpenChange={setIsOpen}>
            <MenuTrigger
                className={cn(
                    "mr-1 shrink-0 rounded-md p-1 text-dark-200 transition-all hover:bg-dark-600 hover:text-dark-50 focus:outline-none",
                    isActive
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                )}
                onClick={(event) => event.preventDefault()}
            >
                <DotsThreeVerticalIcon className="size-4" weight="bold" />
            </MenuTrigger>
            <MenuContent side="right" align="start" sideOffset={4}>
                {isRenaming ? (
                    <div className="px-2 py-1.5">
                        <Input
                            ref={renameInputRef}
                            className="border border-dark-600"
                            value={renameValue}
                            onChange={(event) =>
                                setRenameValue(event.target.value)
                            }
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDownCapture={(event) =>
                                event.stopPropagation()
                            }
                            onKeyDown={(event) => {
                                event.stopPropagation();

                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    void handleRenameSubmit();
                                }

                                if (event.key === "Escape") {
                                    event.preventDefault();
                                    handleRenameCancel();
                                }
                            }}
                            maxLength={120}
                            disabled={isRenamingPending}
                        />

                        {renameError ? (
                            <p className="mt-1 text-xs text-red-300">
                                {renameError}
                            </p>
                        ) : null}

                        <div className="mt-2 flex justify-end gap-1">
                            <Button
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={handleRenameCancel}
                                disabled={isRenamingPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="h-7 px-2 text-xs"
                                onClick={() => void handleRenameSubmit()}
                                disabled={isRenamingPending}
                            >
                                {isRenamingPending ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <MenuItem
                            disabled={isFavoritePending}
                            onSelect={(event) => {
                                event?.preventDefault();
                                void handleFavoriteToggle();
                            }}
                        >
                            <StarIcon
                                className="size-4"
                                weight={
                                    conversation.isFavorite ? "fill" : "regular"
                                }
                            />
                            {conversation.isFavorite
                                ? "Remove favorite"
                                : "Favorite"}
                        </MenuItem>
                        <MenuItem
                            closeOnClick={false}
                            onSelect={(event) => {
                                event?.preventDefault();
                                setIsRenaming(true);
                                setRenameError(null);
                                setMenuError(null);
                                setRenameValue(conversation.title);
                            }}
                        >
                            <PencilSimpleIcon className="size-4" />
                            Rename
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                            destructive
                            onSelect={(event) => {
                                event?.preventDefault();
                                onDeleteRequest(conversation);
                                setIsOpen(false);
                            }}
                        >
                            <TrashIcon className="size-4" />
                            Delete
                        </MenuItem>

                        {menuError ? (
                            <p className="px-3 pt-1 pb-1 text-xs text-red-300">
                                {menuError}
                            </p>
                        ) : null}
                    </>
                )}
            </MenuContent>
        </Menu>
    );
}

function ConversationListItem({
    conversation,
    currentPath,
    isGenerating,
    onDeleteRequest,
    onNavigate,
    onRename,
    onToggleFavorite
}: ConversationListItemProps) {
    const isActive = currentPath === `/conversations/${conversation.id}`;

    return (
        <div
            className={cn(
                "group relative flex items-center rounded-md transition-colors",
                isActive
                    ? "bg-dark-700 text-dark-50"
                    : "text-dark-100 hover:bg-dark-700 hover:text-dark-50"
            )}
        >
            <Link
                to="/conversations/$conversationId"
                params={{
                    conversationId: conversation.id
                }}
                onClick={onNavigate}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-sm"
            >
                <div className="w-3 h-full flex items-center justify-center">
                    {isGenerating ? (
                        <BrailleSpinner className="shrink-0 text-xs leading-none text-primary-400" />
                    ) : conversation.hasUnreadAssistantReply ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-primary-400" />
                    ) : (
                        <MinusIcon
                            className="size-3 shrink-0 text-dark-400"
                            weight="bold"
                        />
                    )}
                </div>
                <span className="min-w-0 flex-1 truncate text-inherit">
                    {conversation.title}
                </span>
            </Link>

            <ConversationActionsMenu
                conversation={conversation}
                isActive={isActive}
                onDeleteRequest={onDeleteRequest}
                onRename={onRename}
                onToggleFavorite={onToggleFavorite}
            />
        </div>
    );
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
    const {
        conversations,
        conversationsError,
        deleteConversation,
        isConversationSending,
        isLoadingConversations,
        renameConversation,
        toggleFavoriteConversation
    } = useChat();
    const { isAuthenticated, isLoading, logout, user } = useAuth();
    const navigate = useNavigate();
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [deleteTarget, setDeleteTarget] =
        useState<ConversationSummary | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeletingConversation, setIsDeletingConversation] = useState(false);

    const favoriteConversations = useMemo(
        () => conversations.filter((conversation) => conversation.isFavorite),
        [conversations]
    );

    const groupedConversations = useMemo(() => {
        const groups = new Map<TimeGroup, ConversationSummary[]>();

        for (const conversation of conversations) {
            if (conversation.isFavorite) {
                continue;
            }

            const group = getTimeGroup(conversation.lastMessageAt);
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group)?.push(conversation);
        }

        return TIME_GROUP_ORDER.filter((group) => groups.has(group)).map(
            (group) => ({
                label: group,
                items: groups.get(group) ?? []
            })
        );
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

    function handleDeleteRequest(conversation: ConversationSummary) {
        setDeleteError(null);
        setDeleteTarget(conversation);
    }

    async function handleDeleteConversation() {
        if (!deleteTarget) {
            return;
        }

        setDeleteError(null);
        setIsDeletingConversation(true);

        try {
            await deleteConversation(deleteTarget.id);
            const deletedConversationId = deleteTarget.id;
            setDeleteTarget(null);

            if (currentPath === `/conversations/${deletedConversationId}`) {
                await navigate({ to: "/" });
                handleNavigate();
            }
        } catch (error) {
            setDeleteError(toErrorMessage(error));
        } finally {
            setIsDeletingConversation(false);
        }
    }

    async function handleLogout() {
        setIsLoggingOut(true);

        try {
            await logout();
            notify.success(
                "Signed out",
                "You've been logged out successfully."
            );
            await navigate({ to: "/login" });
            handleNavigate();
        } catch (error) {
            notify.error("Couldn't sign out", toErrorMessage(error));
        } finally {
            setIsLoggingOut(false);
        }
    }

    return (
        <>
            <aside
                className={cn(
                    "flex h-full flex-col border-r border-dark-600 bg-dark-900 text-white transition-[width] duration-200 ease-out",
                    collapsed ? "w-14" : "w-full",
                    className
                )}
            >
                <div className="flex items-center justify-between p-2">
                    <div
                        className={cn(
                            "flex cursor-pointer items-center gap-1 overflow-hidden transition-opacity duration-200 hover:opacity-90",
                            collapsed ? "w-0 opacity-0" : "opacity-100"
                        )}
                        onClick={() => navigate({ to: "/" })}
                    >
                        <img
                            src="/logos/logo.svg"
                            alt="Logo"
                            className="size-10 shrink-0"
                        />
                        <span className="whitespace-nowrap text-sm font-semibold text-dark-50">
                            Unbound
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={handleToggle}
                        className={cn(
                            "inline-flex shrink-0 items-center justify-center rounded-md text-dark-100 transition hover:bg-dark-700 hover:text-white",
                            collapsed ? "mx-auto size-8" : "size-8"
                        )}
                    >
                        {isMobile ? (
                            <XIcon className="size-4" weight="bold" />
                        ) : collapsed ? (
                            <SidebarSimpleIcon
                                className="size-4"
                                weight="bold"
                            />
                        ) : (
                            <SidebarSimpleIcon
                                className="size-4"
                                weight="fill"
                            />
                        )}
                    </button>
                </div>

                <div className="px-2 pb-2">
                    {collapsed ? (
                        <Tooltip content="New chat" side="right">
                            <button
                                type="button"
                                onClick={handleNewChat}
                                className="mx-auto flex size-8 items-center justify-center rounded-md text-dark-100 transition hover:bg-dark-700 hover:text-white"
                            >
                                <PlusIcon className="size-4" weight="bold" />
                            </button>
                        </Tooltip>
                    ) : (
                        <button
                            type="button"
                            onClick={handleNewChat}
                            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-dark-100 transition hover:bg-dark-700 hover:text-white"
                        >
                            <PlusIcon
                                className="size-4 shrink-0"
                                weight="bold"
                            />
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

                            {favoriteConversations.length > 0 ? (
                                <div className="mb-3">
                                    <div className="flex items-center gap-0.5">
                                        <div className="px-2 py-2 text-xs font-medium text-dark-200">
                                            Favorites
                                        </div>
                                        <div className="w-full h-px bg-dark-600" />
                                    </div>
                                    <div className="space-y-0.5">
                                        {favoriteConversations.map(
                                            (conversation) => (
                                                <ConversationListItem
                                                    key={conversation.id}
                                                    conversation={conversation}
                                                    currentPath={currentPath}
                                                    isGenerating={isConversationSending(
                                                        conversation.id
                                                    )}
                                                    onDeleteRequest={
                                                        handleDeleteRequest
                                                    }
                                                    onNavigate={handleNavigate}
                                                    onRename={
                                                        renameConversation
                                                    }
                                                    onToggleFavorite={
                                                        toggleFavoriteConversation
                                                    }
                                                />
                                            )
                                        )}
                                    </div>
                                </div>
                            ) : null}

                            {groupedConversations.map(({ label, items }) => (
                                <div key={label} className="mb-3">
                                    <div className="flex items-center gap-0.5">
                                        <div className="px-2 py-2 text-xs font-medium text-dark-200">
                                            {label}
                                        </div>
                                        <div className="w-full h-px bg-dark-600" />
                                    </div>
                                    <div className="space-y-0.5">
                                        {items.map((conversation) => (
                                            <ConversationListItem
                                                key={conversation.id}
                                                conversation={conversation}
                                                currentPath={currentPath}
                                                isGenerating={isConversationSending(
                                                    conversation.id
                                                )}
                                                onDeleteRequest={
                                                    handleDeleteRequest
                                                }
                                                onNavigate={handleNavigate}
                                                onRename={renameConversation}
                                                onToggleFavorite={
                                                    toggleFavoriteConversation
                                                }
                                            />
                                        ))}
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
                                            <div className="truncate text-sm text-dark-50">
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
                                <MenuItem
                                    onClick={() => {
                                        navigate({ to: "/settings" });
                                        handleNavigate();
                                    }}
                                >
                                    <GearSixIcon className="size-4" />
                                    Settings
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
                        <div
                            className={cn(
                                "flex flex-col items-center justify-center gap-2"
                            )}
                        >
                            <Button
                                variant="outline"
                                onClick={() => {
                                    navigate({ to: "/login" });
                                    handleNavigate();
                                }}
                                className="size-8 p-0"
                            >
                                <SignInIcon className="size-4" weight="bold" />
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => {
                                    navigate({ to: "/register" });
                                    handleNavigate();
                                }}
                                className="size-8 p-0"
                            >
                                <UserPlusIcon
                                    className="size-4"
                                    weight="bold"
                                />
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    navigate({ to: "/login" });
                                    handleNavigate();
                                }}
                                className="size-8 p-0 w-full"
                            >
                                <SignInIcon
                                    className="size-4 mr-2"
                                    weight="bold"
                                />
                                Login
                            </Button>

                            <Button
                                variant="primary"
                                onClick={() => {
                                    navigate({ to: "/register" });
                                    handleNavigate();
                                }}
                                className="size-8 p-0 w-full"
                            >
                                <UserPlusIcon
                                    className="size-4 mr-2"
                                    weight="bold"
                                />
                                Register
                            </Button>
                        </div>
                    )}
                </div>
            </aside>

            <Modal
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleteTarget(null);
                        setDeleteError(null);
                    }
                }}
            >
                <ModalContent className="max-w-md">
                    <div className="space-y-4 p-4">
                        <div>
                            <ModalTitle>Delete conversation?</ModalTitle>
                            <ModalDescription>
                                {deleteTarget
                                    ? `This will permanently delete "${deleteTarget.title}" and its messages.`
                                    : "This will permanently delete this conversation and its messages."}
                            </ModalDescription>
                        </div>

                        {deleteError ? (
                            <p className="text-sm text-red-300">
                                {deleteError}
                            </p>
                        ) : null}

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setDeleteTarget(null);
                                    setDeleteError(null);
                                }}
                                disabled={isDeletingConversation}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => void handleDeleteConversation()}
                                disabled={isDeletingConversation}
                                className="bg-red-500 text-red-50 hover:bg-red-400"
                            >
                                {isDeletingConversation
                                    ? "Deleting..."
                                    : "Delete"}
                            </Button>
                        </div>
                    </div>
                </ModalContent>
            </Modal>
        </>
    );
}
