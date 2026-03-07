export function getUserInitials(value: string | null | undefined): string {
    const baseValue = value?.trim();

    if (!baseValue) {
        return "?";
    }

    const normalized = baseValue.includes("@")
        ? baseValue.split("@")[0]
        : baseValue;

    const parts = normalized
        .replace(/[._-]+/g, " ")
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length === 0) {
        return normalized.slice(0, 2).toUpperCase();
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
