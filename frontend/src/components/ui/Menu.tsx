import * as React from "react";
import { Menu as Base } from "@base-ui/react";
import { cn } from "@/lib/cn";

const Menu = Base.Root;

const MenuTrigger = Base.Trigger;

interface ContextMenuTriggerProps {
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

const ContextMenuTrigger = React.forwardRef<
    HTMLDivElement,
    ContextMenuTriggerProps & React.HTMLAttributes<HTMLDivElement>
>(({ children, className, disabled, onContextMenu, ...props }, ref) => {
    const [contextPosition, setContextPosition] = React.useState<{
        x: number;
        y: number;
    } | null>(null);

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        if (disabled) return;
        e.preventDefault();
        setContextPosition({ x: e.clientX, y: e.clientY });
        onContextMenu?.(e);
    };

    const handleClose = () => {
        setContextPosition(null);
    };

    return (
        <>
            <div
                ref={ref}
                className={className}
                onContextMenu={handleContextMenu}
                {...props}
            >
                {children}
            </div>
            {contextPosition && (
                <ContextMenuAnchor
                    position={contextPosition}
                    onClose={handleClose}
                />
            )}
        </>
    );
});
ContextMenuTrigger.displayName = "ContextMenuTrigger";

interface ContextMenuAnchorProps {
    position: { x: number; y: number };
    onClose: () => void;
}

const ContextMenuAnchor = ({ position, onClose }: ContextMenuAnchorProps) => {
    const anchorRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                anchorRef.current &&
                !anchorRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [onClose]);

    return (
        <div
            ref={anchorRef}
            style={{
                position: "fixed",
                top: position.y,
                left: position.x,
                width: 0,
                height: 0,
                pointerEvents: "none"
            }}
        />
    );
};

// Context for sharing context menu state
interface ContextMenuContextValue {
    position: { x: number; y: number } | null;
    setPosition: (pos: { x: number; y: number } | null) => void;
}

const ContextMenuContext = React.createContext<ContextMenuContextValue | null>(
    null
);

interface ContextMenuProps {
    children: React.ReactNode;
}

const ContextMenu = ({ children }: ContextMenuProps) => {
    const [position, setPosition] = React.useState<{
        x: number;
        y: number;
    } | null>(null);

    return (
        <ContextMenuContext.Provider value={{ position, setPosition }}>
            <Base.Root
                open={position !== null}
                onOpenChange={(open) => !open && setPosition(null)}
            >
                {children}
            </Base.Root>
        </ContextMenuContext.Provider>
    );
};
ContextMenu.displayName = "ContextMenu";

interface ContextMenuTriggerWrapperProps {
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

const ContextMenuTriggerWrapper = React.forwardRef<
    HTMLDivElement,
    ContextMenuTriggerWrapperProps & React.HTMLAttributes<HTMLDivElement>
>(({ children, className, disabled, ...props }, ref) => {
    const context = React.useContext(ContextMenuContext);

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        if (disabled) return;
        e.preventDefault();
        context?.setPosition({ x: e.clientX, y: e.clientY });
    };

    return (
        <div
            ref={ref}
            className={className}
            onContextMenu={handleContextMenu}
            {...props}
        >
            {children}
        </div>
    );
});
ContextMenuTriggerWrapper.displayName = "ContextMenuTriggerWrapper";

const ContextMenuContent = React.forwardRef<
    React.ElementRef<typeof Base.Popup>,
    React.ComponentPropsWithoutRef<typeof Base.Popup>
>(({ className, children, ...props }, ref) => {
    const context = React.useContext(ContextMenuContext);

    return (
        <Base.Portal>
            <Base.Positioner
                side="bottom"
                align="start"
                anchor={
                    context?.position
                        ? {
                              getBoundingClientRect: () => ({
                                  x: context.position!.x,
                                  y: context.position!.y,
                                  width: 0,
                                  height: 0,
                                  top: context.position!.y,
                                  left: context.position!.x,
                                  right: context.position!.x,
                                  bottom: context.position!.y,
                                  toJSON: () => ({})
                              })
                          }
                        : undefined
                }
                className="z-50"
            >
                <Base.Popup
                    ref={ref}
                    className={cn(
                        "min-w-[200px] max-w-[300px] py-1 rounded-md bg-dark-800 border border-dark-600 shadow-sm animate-in fade-in-0 zoom-in-95 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95",
                        className
                    )}
                    {...props}
                >
                    {children}
                </Base.Popup>
            </Base.Positioner>
        </Base.Portal>
    );
});
ContextMenuContent.displayName = "ContextMenuContent";

const MenuContent = React.forwardRef<
    React.ElementRef<typeof Base.Popup>,
    React.ComponentPropsWithoutRef<typeof Base.Popup> & {
        align?: React.ComponentPropsWithoutRef<typeof Base.Positioner>["align"];
        side?: React.ComponentPropsWithoutRef<typeof Base.Positioner>["side"];
        sideOffset?: React.ComponentPropsWithoutRef<
            typeof Base.Positioner
        >["sideOffset"];
        alignOffset?: React.ComponentPropsWithoutRef<
            typeof Base.Positioner
        >["alignOffset"];
    }
>(
    (
        {
            className,
            align = "start",
            side = "bottom",
            sideOffset = 6,
            alignOffset,
            children,
            ...props
        },
        ref
    ) => (
        <Base.Portal>
            <Base.Positioner
                side={side}
                align={align}
                sideOffset={sideOffset}
                alignOffset={alignOffset}
                className="z-10"
            >
                <Base.Popup
                    ref={ref}
                    className={cn(
                        "min-w-[200px] max-w-[300px] py-1 rounded-md bg-dark-800 border border-dark-600 shadow-sm animate-in fade-in-0 zoom-in-95 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95",
                        className
                    )}
                    {...props}
                >
                    {children}
                </Base.Popup>
            </Base.Positioner>
        </Base.Portal>
    )
);
MenuContent.displayName = "MenuContent";

const MenuItem = React.forwardRef<
    React.ElementRef<typeof Base.Item>,
    React.ComponentPropsWithoutRef<typeof Base.Item> & {
        destructive?: boolean;
        onSelect?: (event?: React.SyntheticEvent) => void;
    }
>(({ className, destructive, onSelect, onClick, ...props }, ref) => (
    <Base.Item
        ref={ref}
        className={cn(
            "relative flex items-center gap-2 px-2 py-1 mx-1 rounded-md text-sm text-dark-100 cursor-pointer select-none transition-colors outline-none",
            // Fallback hover/focus states
            "hover:bg-dark-700 hover:text-white focus:bg-dark-700 focus:text-white",
            // Base UI states
            "data-[highlighted]:bg-dark-700 data-[highlighted]:text-white",
            "data-[disabled]:opacity-30 data-[disabled]:cursor-not-allowed data-[disabled]:pointer-events-none",
            destructive &&
                "text-red-400 hover:bg-red-500/20 hover:text-red-400 focus:bg-red-500/20 focus:text-red-400 data-[highlighted]:bg-red-500/20 data-[highlighted]:text-red-400",
            className
        )}
        onClick={(e) => {
            onClick?.(e);
            onSelect?.(e);
        }}
        {...props}
    />
));
MenuItem.displayName = "MenuItem";

const MenuGroup = Base.Group;

const MenuLabel = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "px-2 py-1 text-xs font-medium text-dark-200 uppercase tracking-wider",
            className
        )}
        {...props}
    />
));
MenuLabel.displayName = "MenuLabel";

const MenuSeparator = React.forwardRef<
    React.ElementRef<typeof Base.Separator>,
    React.ComponentPropsWithoutRef<typeof Base.Separator>
>(({ className, ...props }, ref) => (
    <Base.Separator
        ref={ref}
        className={cn("my-1 mx-2 h-px bg-dark-600", className)}
        {...props}
    />
));
MenuSeparator.displayName = "MenuSeparator";

const MenuShortcut = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
    return (
        <span
            className={cn("ml-auto text-xs text-dark-200", className)}
            {...props}
        />
    );
};
MenuShortcut.displayName = "MenuShortcut";

export {
    Menu,
    MenuTrigger,
    MenuContent,
    MenuItem,
    MenuGroup,
    MenuLabel,
    MenuSeparator,
    MenuShortcut,
    // Context menu components
    ContextMenu,
    ContextMenuTriggerWrapper as ContextMenuTrigger,
    ContextMenuContent
};
