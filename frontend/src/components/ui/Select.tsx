import * as React from "react";
import { Select as Base } from "@base-ui/react";
import { Check, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const Select = Base.Root;

const SelectGroup = Base.Group;

const SelectValue = React.forwardRef<
    React.ElementRef<typeof Base.Value>,
    React.ComponentPropsWithoutRef<typeof Base.Value>
>(({ className, ...props }, ref) => (
    <Base.Value
        ref={ref}
        className={cn("data-[placeholder]:text-dark-200 text-sm", className)}
        {...props}
    />
));
SelectValue.displayName = Base.Value.displayName;

const SelectTrigger = React.forwardRef<
    React.ElementRef<typeof Base.Trigger>,
    React.ComponentPropsWithoutRef<typeof Base.Trigger>
>(({ className, children, ...props }, ref) => (
    <Base.Trigger
        ref={ref}
        className={cn(
            "inline-flex w-full items-center justify-between px-3 py-1.5 bg-dark-800 hover:bg-dark-700 rounded-md outline-none text-white placeholder:text-dark-200 transition-colors cursor-pointer",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
        )}
        {...props}
    >
        {children}

        <Base.Icon className="size-3.5 text-dark-200 shrink-0">
            <ChevronsUpDownIcon className="size-3.5" />
        </Base.Icon>
    </Base.Trigger>
));
SelectTrigger.displayName = Base.Trigger.displayName;

const SelectContent = React.forwardRef<
    React.ElementRef<typeof Base.Popup>,
    React.ComponentPropsWithoutRef<typeof Base.Popup> & {
        position?: React.ComponentPropsWithoutRef<
            typeof Base.Positioner
        >["side"];
        align?: React.ComponentPropsWithoutRef<typeof Base.Positioner>["align"];
        sideOffset?: React.ComponentPropsWithoutRef<
            typeof Base.Positioner
        >["sideOffset"];
    }
>(
    (
        {
            className,
            children,
            position = "bottom",
            align = "start",
            sideOffset = 4,
            ...props
        },
        ref
    ) => (
        <Base.Portal>
            <Base.Positioner
                side={position}
                align={align}
                sideOffset={sideOffset}
                className="z-50 max-h-[var(--visual-viewport-height)] overflow-hidden"
            >
                <Base.Popup
                    ref={ref}
                    className={cn(
                        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-dark-600 bg-dark-800 text-dark-100 shadow-sm animate-in fade-in-0 zoom-in-95 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95",
                        className
                    )}
                    {...props}
                >
                    <div className="p-1">{children}</div>
                </Base.Popup>
            </Base.Positioner>
        </Base.Portal>
    )
);
SelectContent.displayName = Base.Popup.displayName;

const SelectLabel = React.forwardRef<
    React.ElementRef<typeof Base.GroupLabel>,
    React.ComponentPropsWithoutRef<typeof Base.GroupLabel>
>(({ className, ...props }, ref) => (
    <Base.GroupLabel
        ref={ref}
        className={cn(
            "px-1 py-1.5 text-xs font-medium text-dark-200 uppercase tracking-wider",
            className
        )}
        {...props}
    />
));
SelectLabel.displayName = Base.GroupLabel.displayName;

const SelectItem = React.forwardRef<
    React.ElementRef<typeof Base.Item>,
    React.ComponentPropsWithoutRef<typeof Base.Item>
>(({ className, children, ...props }, ref) => (
    <Base.Item
        ref={ref}
        className={cn(
            "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none transition-colors",
            "text-dark-100",
            "hover:bg-dark-700 hover:text-white focus:bg-dark-700 focus:text-white",
            "data-[highlighted]:bg-dark-700 data-[highlighted]:text-white",
            "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
            className
        )}
        {...props}
    >
        <Base.ItemText>{children}</Base.ItemText>
        <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
            <Base.ItemIndicator>
                <Check className="size-4" />
            </Base.ItemIndicator>
        </span>
    </Base.Item>
));
SelectItem.displayName = Base.Item.displayName;

const SelectSeparator = React.forwardRef<
    React.ElementRef<typeof Base.Separator>,
    React.ComponentPropsWithoutRef<typeof Base.Separator>
>(({ className, ...props }, ref) => (
    <Base.Separator
        ref={ref}
        className={cn("-mx-1 my-1 h-px bg-dark-600", className)}
        {...props}
    />
));
SelectSeparator.displayName = Base.Separator.displayName;

export {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectLabel,
    SelectItem,
    SelectSeparator
};
