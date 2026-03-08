import { forwardRef } from "react";
import { Switch as Base } from "@base-ui/react";
import { cn } from "@/lib/cn";

interface SwitchProps {
    /** Size of the switch */
    size?: "sm" | "md" | "lg";
    /** Whether the switch is checked */
    checked?: boolean;
    /** Default checked state (uncontrolled) */
    defaultChecked?: boolean;
    /** Callback when checked state changes */
    onCheckedChange?: (checked: boolean) => void;
    /** Whether the switch is disabled */
    disabled?: boolean;
    /** Additional classes */
    className?: string;
    /** Label for accessibility */
    "aria-label"?: string;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
    (
        {
            size = "md",
            checked,
            defaultChecked,
            onCheckedChange,
            disabled = false,
            className,
            "aria-label": ariaLabel,
            ...props
        },
        ref
    ) => {
        const sizeClasses = {
            sm: "h-4 w-7",
            md: "h-5 w-10",
            lg: "h-6 w-12"
        };

        const thumbClasses = {
            sm: "h-3 w-3 data-[checked]:translate-x-3.5",
            md: "h-4 w-4 data-[checked]:translate-x-5.5",
            lg: "h-5 w-5 data-[checked]:translate-x-6.5"
        };

        return (
            <Base.Root
                ref={ref}
                checked={checked}
                defaultChecked={defaultChecked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                aria-label={ariaLabel}
                className={cn(
                    "relative inline-flex shrink-0 cursor-pointer items-center rounded-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    sizeClasses[size],
                    "bg-dark-800 data-[checked]:bg-primary-100",
                    className
                )}
                {...props}
            >
                <Base.Thumb
                    className={cn(
                        "pointer-events-none block transform rounded-xs bg-white shadow-sm transition-all",
                        thumbClasses[size],
                        "translate-x-0.5 data-[checked]:bg-dark-900"
                    )}
                />
            </Base.Root>
        );
    }
);

Switch.displayName = "Switch";
