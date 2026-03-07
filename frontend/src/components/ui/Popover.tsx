import * as React from "react";
import { Popover as Base } from "@base-ui/react";
import { cn } from "@/lib/cn";

const Popover = Base.Root;

const PopoverTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ComponentPropsWithoutRef<typeof Base.Trigger>
>(({ className, ...props }, ref) => (
    <Base.Trigger ref={ref} className={cn("w-full", className)} {...props} />
));
PopoverTrigger.displayName = "PopoverTrigger";

const PopoverContent = React.forwardRef<
    React.ElementRef<typeof Base.Popup>,
    React.ComponentPropsWithoutRef<typeof Base.Popup> & {
        side?: React.ComponentPropsWithoutRef<typeof Base.Positioner>["side"];
        align?: React.ComponentPropsWithoutRef<typeof Base.Positioner>["align"];
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
            side = "bottom",
            align = "center",
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
                    tabIndex={-1}
                    style={{ outline: "none" }}
                    className={cn(
                        "min-w-[240px] bg-dark-800 border border-dark-600 text-dark-50 shadow-sm rounded-md px-2 py-0.5 text-xs outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0",
                        "animate-in fade-in-0 zoom-in-95 duration-150 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95 max-w-[300px]",
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
PopoverContent.displayName = Base.Popup.displayName;

const PopoverTitle = React.forwardRef<
    React.ElementRef<typeof Base.Title>,
    React.ComponentPropsWithoutRef<typeof Base.Title>
>(({ className, ...props }, ref) => (
    <Base.Title ref={ref} className={cn(className)} {...props} />
));
PopoverTitle.displayName = Base.Title.displayName;

const PopoverDescription = React.forwardRef<
    React.ElementRef<typeof Base.Description>,
    React.ComponentPropsWithoutRef<typeof Base.Description>
>(({ className, ...props }, ref) => (
    <Base.Description ref={ref} className={cn(className)} {...props} />
));
PopoverDescription.displayName = Base.Description.displayName;

export {
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverTitle,
    PopoverDescription
};
