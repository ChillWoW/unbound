import { env } from "../config/env";

function serializeCookie(
    name: string,
    value: string,
    options: {
        expires?: Date;
        httpOnly?: boolean;
        maxAge?: number;
        path?: string;
        sameSite?: "Lax" | "Strict" | "None";
        secure?: boolean;
    } = {}
): string {
    const segments = [`${name}=${encodeURIComponent(value)}`];

    if (options.maxAge !== undefined) {
        segments.push(`Max-Age=${options.maxAge}`);
    }

    if (options.expires) {
        segments.push(`Expires=${options.expires.toUTCString()}`);
    }

    segments.push(`Path=${options.path ?? "/"}`);

    if (options.httpOnly) {
        segments.push("HttpOnly");
    }

    if (options.secure) {
        segments.push("Secure");
    }

    if (options.sameSite) {
        segments.push(`SameSite=${options.sameSite}`);
    }

    return segments.join("; ");
}

function parseCookieHeader(header: string | null): Record<string, string> {
    if (!header) {
        return {};
    }

    return header.split(";").reduce<Record<string, string>>((cookies, pair) => {
        const trimmedPair = pair.trim();

        if (!trimmedPair) {
            return cookies;
        }

        const separatorIndex = trimmedPair.indexOf("=");

        if (separatorIndex === -1) {
            return cookies;
        }

        const key = trimmedPair.slice(0, separatorIndex).trim();
        const value = trimmedPair.slice(separatorIndex + 1).trim();

        cookies[key] = decodeURIComponent(value);

        return cookies;
    }, {});
}

export function getSessionIdFromRequest(request: Request): string | null {
    const cookies = parseCookieHeader(request.headers.get("cookie"));

    return cookies[env.sessionCookieName] ?? null;
}

export function createSessionCookie(sessionId: string): string {
    return serializeCookie(env.sessionCookieName, sessionId, {
        httpOnly: true,
        maxAge: env.sessionMaxAgeSeconds,
        path: "/",
        sameSite: "Lax",
        secure: env.isProduction
    });
}

export function clearSessionCookie(): string {
    return serializeCookie(env.sessionCookieName, "", {
        expires: new Date(0),
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "Lax",
        secure: env.isProduction
    });
}
