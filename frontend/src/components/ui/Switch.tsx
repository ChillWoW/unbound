import { forwardRef } from "react";
import { Switch as Base } from "@base-ui/react";
import { cn } from "@/lib/cn";

interface SwitchProps {
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
        return (
            <Base.Root
                ref={ref}
                checked={checked}
                defaultChecked={defaultChecked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                aria-label={ariaLabel}
                className={cn(
                    "relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    "bg-dark-800 data-[checked]:bg-primary-100",
                    className
                )}
                {...props}
            >
                <Base.Thumb
                    className={cn(
                        "pointer-events-none block h-4 w-4 transform rounded-lg bg-white shadow-sm transition-all",
                        "translate-x-0.5 data-[checked]:translate-x-5.5 data-[checked]:bg-dark-900"
                    )}
                />
            </Base.Root>
        );
    }
);

Switch.displayName = "Switch";
