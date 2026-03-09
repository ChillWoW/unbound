import {
    CheckCircleIcon,
    InfoIcon,
    WarningCircleIcon,
    XCircleIcon,
    XIcon
} from "@phosphor-icons/react";
import { Toaster as SonnerToaster } from "sonner";
import { cn } from "@/lib/cn";

const toastSurfaceClassName =
    "group rounded-md border border-dark-600 bg-dark-850 text-dark-50 shadow-sm";

export function Toaster() {
    return (
        <SonnerToaster
            theme="dark"
            position="bottom-right"
            expand
            visibleToasts={4}
            closeButton
            offset={16}
            mobileOffset={16}
            icons={{
                success: (
                    <CheckCircleIcon
                        className="size-4 text-emerald-400"
                        weight="fill"
                    />
                ),
                info: (
                    <InfoIcon
                        className="size-4 text-primary-400"
                        weight="fill"
                    />
                ),
                warning: (
                    <WarningCircleIcon
                        className="size-4 text-amber-400"
                        weight="fill"
                    />
                ),
                error: (
                    <XCircleIcon
                        className="size-4 text-red-400"
                        weight="fill"
                    />
                ),
                close: <XIcon className="size-3 text-dark-200" weight="bold" />
            }}
            toastOptions={{
                unstyled: true,
                duration: 3000,
                classNames: {
                    toast: cn(
                        toastSurfaceClassName,
                        "flex w-full items-start gap-3 p-3 transition-all duration-200"
                    ),
                    title: "text-sm font-medium text-dark-50",
                    description: "text-sm text-dark-200",
                    content: "flex flex-col gap-1",
                    icon: "mt-0.5 shrink-0",
                    success: "border-emerald-500/20",
                    error: "border-red-500/20",
                    warning: "border-red-500/20",
                    info: "border-primary-500/20",
                    loading: "border-primary-500/20",
                    default: "border-dark-600",
                    closeButton: cn(
                        "right-3 top-3 flex size-6 items-center justify-center rounded-md border border-dark-600",
                        "bg-dark-700 text-dark-200 transition-colors duration-150 hover:bg-dark-600 hover:text-dark-50"
                    ),
                    actionButton: cn(
                        "inline-flex h-8 items-center justify-center rounded-md bg-primary-300 px-3 text-sm font-medium",
                        "text-dark-900 transition-colors duration-150 hover:bg-primary-400"
                    ),
                    cancelButton: cn(
                        "inline-flex h-8 items-center justify-center rounded-md bg-dark-700 px-3 text-sm font-medium",
                        "text-white transition-colors duration-150 hover:bg-dark-600"
                    )
                }
            }}
        />
    );
}
