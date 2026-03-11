import { createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env";
import { getSessionIdFromRequest } from "../../lib/cookies";
import { logger } from "../../lib/logger";
import { consumeRateLimit } from "../../lib/rate-limit";
import { hashPassword, verifyPassword } from "../../lib/password";
import { emailService } from "../email";
import { usersRepository } from "../users/users.repository";
import { toPublicUser } from "../users/users.types";
import { authRepository } from "./auth.repository";
import type {
    ForgotPasswordInput,
    LoginInput,
    RegisterInput,
    ResendVerificationInput,
    ResetPasswordInput,
    VerifyEmailInput
} from "./auth.types";
import { AuthError } from "./auth.types";

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 15;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 1000 * 60 * 15;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 15;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 1000 * 60 * 15;
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 15;
const AUTH_RATE_LIMIT_MESSAGE =
    "Too many attempts right now. Please wait a few minutes and try again.";
const LOGIN_FAILURE_MESSAGE = "Unable to sign in with those credentials.";

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function createSessionId(): string {
    return randomBytes(32).toString("hex");
}

function hashSessionId(sessionId: string): string {
    return createHash("sha256").update(sessionId).digest("hex");
}

function createSessionExpiry(): Date {
    return new Date(Date.now() + env.sessionMaxAgeSeconds * 1000);
}

function createEmailVerificationExpiry(): Date {
    return new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
}

function createEmailVerificationToken(): string {
    return randomBytes(32).toString("hex");
}

function createPasswordResetToken(): string {
    return randomBytes(32).toString("hex");
}

function hashEmailVerificationToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function hashPasswordResetToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function getClientIdentifier(request: Request): string {
    const forwardedFor = request.headers.get("x-forwarded-for");

    if (forwardedFor) {
        const firstAddress = forwardedFor.split(",")[0]?.trim();

        if (firstAddress) {
            return firstAddress;
        }
    }

    const directAddress =
        request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-real-ip") ??
        "unknown";

    return directAddress.trim().toLowerCase() || "unknown";
}

function consumeAuthRateLimit(input: {
    scope: string;
    request: Request;
    limit: number;
    suffix?: string;
}) {
    const key = [getClientIdentifier(input.request), input.suffix]
        .filter(Boolean)
        .join(":");

    if (
        !consumeRateLimit({
            scope: input.scope,
            key,
            limit: input.limit,
            windowMs: RATE_LIMIT_WINDOW_MS
        })
    ) {
        throw new AuthError(429, AUTH_RATE_LIMIT_MESSAGE);
    }
}

function enforceEmailRateLimit(
    scope: string,
    request: Request,
    email: string,
    limit: number
) {
    consumeAuthRateLimit({
        scope,
        request,
        limit,
        suffix: createHash("sha256").update(email).digest("hex")
    });
}

function enforceTokenRateLimit(
    scope: string,
    request: Request,
    token: string,
    limit: number
) {
    consumeAuthRateLimit({
        scope,
        request,
        limit,
        suffix: createHash("sha256").update(token).digest("hex")
    });
}

function createEmailVerificationUrl(token: string): string {
    const url = new URL("/verify-email", env.corsOrigin);
    url.searchParams.set("token", token);
    return url.toString();
}

function createPasswordResetExpiry(): Date {
    return new Date(Date.now() + PASSWORD_RESET_TTL_MS);
}

function createPasswordResetUrl(token: string): string {
    const url = new URL("/reset-password", env.corsOrigin);
    url.searchParams.set("token", token);
    return url.toString();
}

async function createSessionForUser(userId: string): Promise<string> {
    const sessionId = createSessionId();

    await authRepository.createSession({
        id: hashSessionId(sessionId),
        userId,
        expiresAt: createSessionExpiry()
    });

    return sessionId;
}

async function sendVerificationEmail(user: {
    id: string;
    email: string;
    name: string | null;
}) {
    const latestToken = await authRepository.findLatestEmailVerificationTokenForUser(
        user.id
    );

    if (
        latestToken &&
        Date.now() - latestToken.createdAt.getTime() <
            EMAIL_VERIFICATION_RESEND_COOLDOWN_MS
    ) {
        return false;
    }

    const token = createEmailVerificationToken();

    await authRepository.replaceEmailVerificationToken({
        userId: user.id,
        tokenHash: hashEmailVerificationToken(token),
        expiresAt: createEmailVerificationExpiry()
    });

    try {
        await emailService.sendTemplateEmail({
            to: user.email,
            template: "verifyEmail",
            data: {
                name: user.name,
                verifyUrl: createEmailVerificationUrl(token)
            },
            tags: [
                {
                    name: "type",
                    value: "email_verification"
                }
            ]
        });
    } catch (error) {
        logger.error("Failed to send verification email.", {
            userId: user.id,
            email: user.email,
            error: error instanceof Error ? error.message : error
        });
    }

    return true;
}

async function sendPasswordResetEmail(user: {
    id: string;
    email: string;
    name: string | null;
}) {
    const latestToken = await authRepository.findLatestPasswordResetTokenForUser(
        user.id
    );

    if (
        latestToken &&
        Date.now() - latestToken.createdAt.getTime() <
            PASSWORD_RESET_RESEND_COOLDOWN_MS
    ) {
        return;
    }

    const token = createPasswordResetToken();

    await authRepository.replacePasswordResetToken({
        userId: user.id,
        tokenHash: hashPasswordResetToken(token),
        expiresAt: createPasswordResetExpiry()
    });

    try {
        await emailService.sendTemplateEmail({
            to: user.email,
            template: "resetPassword",
            data: {
                name: user.name,
                resetUrl: createPasswordResetUrl(token)
            },
            tags: [
                {
                    name: "type",
                    value: "password_reset"
                }
            ]
        });
    } catch (error) {
        logger.error("Failed to send password reset email.", {
            userId: user.id,
            email: user.email,
            error: error instanceof Error ? error.message : error
        });
    }
}

export const authService = {
    async register(request: Request, input: RegisterInput) {
        const email = normalizeEmail(input.email);
        consumeAuthRateLimit({
            scope: "auth.register.ip",
            request,
            limit: 10
        });
        enforceEmailRateLimit("auth.register.email", request, email, 5);

        const existingUser = await usersRepository.findByEmail(email);

        if (existingUser) {
            if (!existingUser.emailVerifiedAt) {
                await sendVerificationEmail(existingUser);
            }

            return {
                user: null,
                sessionToken: null
            };
        }

        const passwordHash = await hashPassword(input.password);
        const user = await usersRepository.create({
            email,
            name: input.name,
            passwordHash
        });
        const sessionToken = await createSessionForUser(user.id);
        await sendVerificationEmail(user);

        return {
            user: toPublicUser(user),
            sessionToken
        };
    },

    async login(request: Request, input: LoginInput) {
        const email = normalizeEmail(input.email);
        consumeAuthRateLimit({
            scope: "auth.login.ip",
            request,
            limit: 20
        });
        enforceEmailRateLimit("auth.login.email", request, email, 10);

        const user = await usersRepository.findByEmail(email);

        if (!user) {
            throw new AuthError(401, LOGIN_FAILURE_MESSAGE);
        }

        const isValidPassword = await verifyPassword(
            input.password,
            user.passwordHash
        );

        if (!isValidPassword) {
            throw new AuthError(401, LOGIN_FAILURE_MESSAGE);
        }

        if (!user.emailVerifiedAt) {
            throw new AuthError(401, LOGIN_FAILURE_MESSAGE);
        }

        const sessionToken = await createSessionForUser(user.id);

        return {
            user: toPublicUser(user),
            sessionToken
        };
    },

    async logout(request: Request) {
        const sessionId = getSessionIdFromRequest(request);

        if (!sessionId) {
            return;
        }

        await authRepository.deleteSession(hashSessionId(sessionId));
    },

    async getCurrentUser(request: Request) {
        const sessionId = getSessionIdFromRequest(request);

        if (!sessionId) {
            return null;
        }

        const session = await authRepository.findSessionById(
            hashSessionId(sessionId)
        );

        if (!session) {
            return null;
        }

        if (session.expiresAt.getTime() <= Date.now()) {
            await authRepository.deleteSession(session.id);
            return null;
        }

        const user = await usersRepository.findById(session.userId);

        if (!user) {
            await authRepository.deleteSession(session.id);
            return null;
        }

        return toPublicUser(user);
    },

    async verifyEmail(request: Request, input: VerifyEmailInput) {
        const token = input.token.trim();

        consumeAuthRateLimit({
            scope: "auth.verify-email.ip",
            request,
            limit: 20
        });

        if (!token) {
            throw new AuthError(400, "Verification token is required.");
        }

        enforceTokenRateLimit("auth.verify-email.token", request, token, 10);

        const record = await authRepository.findValidEmailVerificationTokenByHash(
            hashEmailVerificationToken(token)
        );

        if (!record) {
            throw new AuthError(
                400,
                "This verification link is invalid or has expired."
            );
        }

        const user = await usersRepository.findById(record.userId);

        if (!user) {
            throw new AuthError(
                400,
                "This verification link is invalid or has expired."
            );
        }

        const verifiedUser = user.emailVerifiedAt
            ? user
            : await usersRepository.markEmailVerified(user.id);

        if (!verifiedUser) {
            throw new Error("Failed to verify email.");
        }

        await authRepository.deleteEmailVerificationTokensForUser(user.id);
        const sessionToken = await createSessionForUser(user.id);

        return {
            user: toPublicUser(verifiedUser),
            sessionToken
        };
    },

    async resendVerification(request: Request, input: ResendVerificationInput) {
        consumeAuthRateLimit({
            scope: "auth.resend-verification.ip",
            request,
            limit: 10
        });

        const currentUser = await this.getCurrentUser(request);

        if (currentUser && !currentUser.isEmailVerified) {
            const user = await usersRepository.findById(currentUser.id);

            if (user) {
                await sendVerificationEmail(user);
            }

            return { success: true };
        }

        const email = input.email ? normalizeEmail(input.email) : null;

        if (!email) {
            throw new AuthError(400, "Email is required.");
        }

        enforceEmailRateLimit("auth.resend-verification.email", request, email, 5);

        const user = await usersRepository.findByEmail(email);

        if (user && !user.emailVerifiedAt) {
            await sendVerificationEmail(user);
        }

        return { success: true };
    },

    async forgotPassword(request: Request, input: ForgotPasswordInput) {
        const email = normalizeEmail(input.email);
        consumeAuthRateLimit({
            scope: "auth.forgot-password.ip",
            request,
            limit: 10
        });
        enforceEmailRateLimit("auth.forgot-password.email", request, email, 5);
        const user = await usersRepository.findByEmail(email);

        if (user) {
            await sendPasswordResetEmail(user);
        }

        return { success: true };
    },

    async resetPassword(request: Request, input: ResetPasswordInput) {
        const token = input.token.trim();

        consumeAuthRateLimit({
            scope: "auth.reset-password.ip",
            request,
            limit: 10
        });

        if (!token) {
            throw new AuthError(400, "Reset token is required.");
        }

        enforceTokenRateLimit("auth.reset-password.token", request, token, 5);

        const record = await authRepository.findValidPasswordResetTokenByHash(
            hashPasswordResetToken(token)
        );

        if (!record) {
            throw new AuthError(
                400,
                "This password reset link is invalid or has expired."
            );
        }

        const user = await usersRepository.findById(record.userId);

        if (!user) {
            throw new AuthError(
                400,
                "This password reset link is invalid or has expired."
            );
        }

        const passwordHash = await hashPassword(input.password);
        const updatedUser = await usersRepository.updatePassword(
            user.id,
            passwordHash
        );

        if (!updatedUser) {
            throw new Error("Failed to reset password.");
        }

        await authRepository.deletePasswordResetTokensForUser(user.id);
        await authRepository.deleteSessionsByUserId(user.id);

        return { success: true };
    }
};
