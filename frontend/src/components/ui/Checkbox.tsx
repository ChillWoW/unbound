import { Checkbox as Base } from "@base-ui/react";
import { cn } from "@/lib/cn";
import { forwardRef, useCallback, type ReactNode } from "react";
import { CheckIcon, MinusIcon } from "@phosphor-icons/react";

interface CheckboxProps {
    checked?: boolean;
    defaultChecked?: boolean;
    indeterminate?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
    icon?: ReactNode;
    label?: string;
    className?: string;
    alwaysShowIcon?: boolean;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
    (
        {
            checked,
            defaultChecked,
            indeterminate = false,
            onChange,
            disabled = false,
            icon,
            label,
            className,
            alwaysShowIcon = false,
            ...props
        },
        ref
    ) => {
        const handleChange = useCallback(
            (checked: boolean) => {
                if (disabled) return;
                onChange?.(checked);
            },
            [onChange, disabled]
        );

        const Element = (
            <Base.Root
                ref={ref}
                checked={checked}
                defaultChecked={defaultChecked}
                indeterminate={indeterminate}
                onCheckedChange={handleChange}
                disabled={disabled}
                className={cn(
                    "relative inline-flex items-center justify-center size-5 border rounded-sm transition-colors",
                    "border-dark-600 text-dark-50 bg-dark-800 data-[checked]:bg-primary-100 data-[checked]:border-primary-100 data-[indeterminate]:bg-primary-100 data-[indeterminate]:border-primary-100",
                    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                    className
                )}
                {...props}
            >
                <Base.Indicator
                    keepMounted={alwaysShowIcon}
                    className={cn(
                        "text-dark-900 flex items-center justify-center",
                        alwaysShowIcon
                            ? "opacity-100"
                            : "data-[hidden]:opacity-0"
                    )}
                >
                    {indeterminate ? (
                        <MinusIcon className="size-3.5" />
                    ) : icon ? (
                        icon
                    ) : (
                        <CheckIcon className="size-3.5" />
                    )}
                </Base.Indicator>
            </Base.Root>
        );

        if (!label) return Element;

        return (
            <label className="flex items-center gap-2">
                {Element}
                <span className="text-sm font-medium">{label}</span>
            </label>
        );
    }
);
