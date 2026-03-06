import { forwardRef, useState } from "react";
import {
    Input as Base,
    type InputProps as BaseInputProps
} from "@base-ui/react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

interface InputProps extends BaseInputProps {
    leftSection?: React.ReactNode;
    rightSection?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    (
        { className, leftSection, rightSection, onFocus, onBlur, ...props },
        ref
    ) => {
        const rightEl = rightSection;

        return (
            <div
                className={cn(
                    "flex items-center w-full gap-2",
                    "bg-dark-800 rounded-md px-2",
                    className
                )}
            >
                {leftSection && (
                    <div className="flex shrink-0 items-center text-dark-300">
                        {leftSection}
                    </div>
                )}

                <Base
                    ref={ref}
                    className={cn(
                        "flex-1 min-w-0 bg-transparent py-1.5 text-sm",
                        "outline-none text-white placeholder:text-dark-200",
                        "disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                    {...props}
                />

                {rightEl && (
                    <div className="flex shrink-0 items-center">{rightEl}</div>
                )}
            </div>
        );
    }
);

Input.displayName = "Input";

export interface PasswordInputProps extends Omit<
    InputProps,
    "type" | "rightSection"
> {}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
    (props, ref) => {
        const [showPassword, setShowPassword] = useState(false);

        return (
            <Input
                ref={ref}
                type={showPassword ? "text" : "password"}
                rightSection={
                    <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className={cn(
                            "rounded-md p-1 transition-colors",
                            "text-dark-300 hover:text-white hover:bg-dark-700"
                        )}
                        tabIndex={-1}
                    >
                        {showPassword ? (
                            <EyeOff className="size-4" />
                        ) : (
                            <Eye className="size-4" />
                        )}
                    </button>
                }
                placeholder={props.placeholder || "Enter your password"}
                {...props}
            />
        );
    }
);

PasswordInput.displayName = "PasswordInput";
