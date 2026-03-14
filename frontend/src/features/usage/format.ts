export function formatCostFromMicros(micros: number): string {
    const dollars = micros / 1_000_000;
    if (dollars === 0) return "$0.00";
    if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
    return `$${dollars.toFixed(2)}`;
}

export function formatCostFromCents(cents: number): string {
    const dollars = cents / 100;
    if (dollars === 0) return "$0.00";
    return `$${dollars.toFixed(2)}`;
}

export function formatTokenCount(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
}

export function getModelShortName(modelId: string): string {
    const parts = modelId.split("/");
    const name = parts[parts.length - 1];
    return name
        .replace(/-\d{4}-\d{2}-\d{2}$/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
