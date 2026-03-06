function getRequiredEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is required.`);
    }

    return value;
}

function getNumberEnv(name: string, fallback: number): number {
    const value = process.env[name];

    if (!value) {
        return fallback;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a valid number.`);
    }

    return parsed;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: getNumberEnv("PORT", 1234),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3500",
    databaseUrl: getRequiredEnv("DATABASE_URL"),
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "unbound_session",
    sessionMaxAgeSeconds: getNumberEnv(
        "SESSION_MAX_AGE_SECONDS",
        60 * 60 * 24 * 30
    )
} as const;
