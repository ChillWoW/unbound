function parseBrowserUrl(value: string): URL | null {
    try {
        return new URL(value, window.location.origin);
    } catch {
        return null;
    }
}

export function normalizeSafeLinkUrl(value: unknown): string | null {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const url = parseBrowserUrl(value.trim());

    if (!url || !["http:", "https:"].includes(url.protocol)) {
        return null;
    }

    return url.toString();
}

export function normalizeSafeImageUrl(value: unknown): {
    url: string;
    autoLoad: boolean;
} | null {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const trimmed = value.trim();

    if (trimmed.startsWith("blob:")) {
        return {
            url: trimmed,
            autoLoad: true
        };
    }

    if (/^data:image\//i.test(trimmed)) {
        return {
            url: trimmed,
            autoLoad: true
        };
    }

    const url = parseBrowserUrl(trimmed);

    if (!url || !["http:", "https:"].includes(url.protocol)) {
        return null;
    }

    return {
        url: url.toString(),
        autoLoad: url.origin === window.location.origin
    };
}
