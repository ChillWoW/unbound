import { Toaster as SileoToaster } from "sileo";

const toastOptions = {
    duration: 4000,
    fill: "var(--color-dark-850)",
    roundness: 18,
    autopilot: {
        expand: 160,
        collapse: 3400
    },
    styles: {
        title: "text-sm font-medium tracking-[-0.01em] text-dark-50!",
        description: "text-sm leading-6 text-dark-200!",
        badge: "border border-white/8 bg-white/6",
        button: "bg-white/8 text-dark-50! hover:bg-white/12!"
    }
} as const;

export function Toaster() {
    return (
        <SileoToaster
            position="bottom-right"
            offset={16}
            options={toastOptions}
        />
    );
}
