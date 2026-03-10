import { createElement, type ReactNode } from "react";
import {
    CheckCircleIcon,
    InfoIcon,
    SpinnerGapIcon,
    WarningCircleIcon,
    XCircleIcon
} from "@phosphor-icons/react";
import {
    sileo,
    type SileoOptions,
    type SileoPosition,
    type SileoState
} from "sileo";

export type ToastData = Omit<SileoOptions, "title" | "description" | "type"> & {
    title?: string;
    description?: ReactNode | string;
};

type PromiseToastData<T> = {
    loading: ToastData;
    success: ToastData | ((value: T) => ToastData);
    error: ToastData | ((error: unknown) => ToastData);
    action?: ToastData | ((value: T) => ToastData);
    position?: SileoPosition;
};

const icons: Record<SileoState, ReactNode> = {
    success: createElement(CheckCircleIcon, { className: "size-4", weight: "fill" }),
    error: createElement(XCircleIcon, { className: "size-4", weight: "fill" }),
    warning: createElement(WarningCircleIcon, {
        className: "size-4",
        weight: "fill"
    }),
    info: createElement(InfoIcon, { className: "size-4", weight: "fill" }),
    loading: createElement(SpinnerGapIcon, {
        className: "size-4 animate-spin",
        weight: "bold"
    }),
    action: createElement(InfoIcon, { className: "size-4", weight: "fill" })
};

function withType(type: SileoState, data: ToastData = {}): SileoOptions {
    return {
        ...data,
        type,
        icon: data.icon ?? icons[type]
    };
}

function mapPromiseState<T>(
    type: SileoState,
    value: ToastData | ((result: T) => ToastData)
) {
    if (typeof value === "function") {
        return (result: T) => withType(type, value(result));
    }

    return withType(type, value);
}

export const notify = {
    success(data: ToastData) {
        return sileo.success(withType("success", data));
    },

    error(data: ToastData) {
        return sileo.error(withType("error", data));
    },

    warning(data: ToastData) {
        return sileo.warning(withType("warning", data));
    },

    info(data: ToastData) {
        return sileo.info(withType("info", data));
    },

    message(data: ToastData) {
        return sileo.show(withType("info", data));
    },

    loading(data: ToastData) {
        return sileo.show(withType("loading", data));
    },

    dismiss(id: string) {
        return sileo.dismiss(id);
    },

    promise<T>(
        promise: Promise<T> | (() => Promise<T>),
        messages: PromiseToastData<T>
    ) {
        return sileo.promise(promise, {
            position: messages.position,
            loading: withType("loading", messages.loading),
            success: mapPromiseState("success", messages.success),
            error: mapPromiseState("error", messages.error),
            action: messages.action
                ? mapPromiseState("action", messages.action)
                : undefined
        });
    }
};
