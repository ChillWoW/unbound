import { forwardRef } from "react";
import {
    Button as BaseButton,
    type ButtonProps as BaseButtonProps
} from "@base-ui/react/button";
import { cn } from "@/lib/cn";

export interface ButtonProps extends BaseButtonProps {
    variant?: "primary" | "default" | "ghost";
    className?: string;
}

const variantClasses = {
    primary: "bg-primary-50 hover:bg-primary-400 text-dark-900",
    default: "bg-dark-700 hover:bg-dark-600 text-white",
    ghost: "bg-transparent hover:bg-dark-600 text-white"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", ...props }, ref) => {
        return (
            <BaseButton
                ref={ref}
                className={cn(
                    "inline-flex items-center gap-2 justify-center rounded-md px-3 h-8 text-sm font-medium transition-colors",
                    variantClasses[variant],
                    "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
                    className
                )}
                {...props}
            />
        );
    }
);

Button.displayName = "Button";
