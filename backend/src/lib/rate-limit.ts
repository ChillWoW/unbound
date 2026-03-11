type RateLimitEntry = {
    timestamps: number[];
    updatedAt: number;
};

const buckets = new Map<string, RateLimitEntry>();
let cleanupCounter = 0;

function pruneTimestamps(timestamps: number[], now: number, windowMs: number) {
    while (
        timestamps.length > 0 &&
        timestamps[0] !== undefined &&
        now - timestamps[0] >= windowMs
    ) {
        timestamps.shift();
    }
}

function cleanupExpiredBuckets(now: number) {
    for (const [key, entry] of buckets.entries()) {
        if (now - entry.updatedAt > 60 * 60 * 1000) {
            buckets.delete(key);
        }
    }
}

export function consumeRateLimit(input: {
    scope: string;
    key: string;
    limit: number;
    windowMs: number;
}): boolean {
    const now = Date.now();
    const bucketKey = `${input.scope}:${input.key}`;
    const existing = buckets.get(bucketKey);
    const timestamps = existing?.timestamps ?? [];

    pruneTimestamps(timestamps, now, input.windowMs);

    if (timestamps.length >= input.limit) {
        buckets.set(bucketKey, {
            timestamps,
            updatedAt: now
        });
        return false;
    }

    timestamps.push(now);
    buckets.set(bucketKey, {
        timestamps,
        updatedAt: now
    });

    cleanupCounter += 1;

    if (cleanupCounter % 100 === 0) {
        cleanupExpiredBuckets(now);
    }

    return true;
}
