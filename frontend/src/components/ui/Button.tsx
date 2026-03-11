import { forwardRef } from "react";
import {
    Button as BaseButton,
    type ButtonProps as BaseButtonProps
} from "@base-ui/react/button";
import { cn } from "@/lib/cn";

export interface ButtonProps extends BaseButtonProps {
    variant?: "primary" | "default" | "ghost" | "outline";
    className?: string;
    size?: "sm" | "md" | "lg";
}

const variantClasses = {
    primary: "bg-primary-300 hover:bg-primary-400 text-dark-900",
    default: "bg-dark-700 hover:bg-dark-600 text-white",
    ghost: "bg-transparent hover:bg-dark-600 text-white",
    outline:
        "border border-dark-600 hover:bg-dark-600 bg-transparent text-white"
};

const sizeClasses = {
    sm: "h-7 text-xs",
    md: "h-8 text-sm",
    lg: "h-9 text-base"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "md", ...props }, ref) => {
        return (
            <BaseButton
                ref={ref}
                className={cn(
                    "inline-flex items-center gap-2 justify-center rounded-md px-3 font-medium transition-colors",
                    variantClasses[variant],
                    "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
                    sizeClasses[size],
                    className
                )}
                {...props}
            />
        );
    }
);

Button.displayName = "Button";
