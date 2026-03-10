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

function getOptionalEnv(name: string): string | null {
    const value = process.env[name]?.trim();
    return value ? value : null;
}

function getHex32ByteEnv(name: string): Buffer {
    const value = getRequiredEnv(name).trim();

    if (!/^[a-fA-F0-9]{64}$/.test(value)) {
        throw new Error(`${name} must be a 64-character hex string.`);
    }

    return Buffer.from(value, "hex");
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
    nodeEnv,
    isProduction: nodeEnv === "production",
    debug: process.env.DEBUG === "true",
    port: getNumberEnv("PORT", 1234),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3500",
    searxngBaseUrl: getOptionalEnv("SEARXNG_BASE_URL"),
    databaseUrl: getRequiredEnv("DATABASE_URL"),
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "unbound_session",
    sessionMaxAgeSeconds: getNumberEnv(
        "SESSION_MAX_AGE_SECONDS",
        60 * 60 * 24 * 30
    ),
    settingsEncryptionKey: getHex32ByteEnv("SETTINGS_ENCRYPTION_KEY"),
    openrouterTitleApiKey: getOptionalEnv("OPENROUTER_TITLE_API_KEY"),
    emailEnabled: process.env.EMAIL_ENABLED === "true",
    emailFrom: getOptionalEnv("EMAIL_FROM"),
    emailReplyTo: getOptionalEnv("EMAIL_REPLY_TO"),
    resendApiKey: getOptionalEnv("RESEND_API_KEY")
} as const;
