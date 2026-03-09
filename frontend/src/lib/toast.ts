import type { ReactNode } from "react";
import { toast, type ExternalToast } from "sonner";

type NotifyOptions = Omit<ExternalToast, "description"> & {
    description?: ReactNode;
};

type PromiseMessages<T> = {
    loading: ReactNode;
    success: ReactNode | ((value: T) => ReactNode);
    error: ReactNode | ((error: unknown) => ReactNode);
    description?: ReactNode | ((value: T) => ReactNode);
};

export const notify = {
    success(title: ReactNode, description?: ReactNode, options?: NotifyOptions) {
        return toast.success(title, { ...options, description });
    },

    error(title: ReactNode, description?: ReactNode, options?: NotifyOptions) {
        return toast.error(title, { ...options, description });
    },

    info(title: ReactNode, description?: ReactNode, options?: NotifyOptions) {
        return toast.info(title, { ...options, description });
    },

    message(title: ReactNode, description?: ReactNode, options?: NotifyOptions) {
        return toast.message(title, { ...options, description });
    },

    loading(title: ReactNode, description?: ReactNode, options?: NotifyOptions) {
        return toast.loading(title, { ...options, description });
    },

    dismiss(id?: string | number) {
        return toast.dismiss(id);
    },

    promise<T>(
        promise: Promise<T> | (() => Promise<T>),
        messages: PromiseMessages<T>,
        options?: Omit<NotifyOptions, "description">
    ) {
        return toast.promise(promise, {
            ...options,
            loading: messages.loading,
            success: messages.success,
            error: messages.error,
            description: messages.description
        });
    }
};
