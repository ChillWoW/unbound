import { createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env";
import { getSessionIdFromRequest } from "../../lib/cookies";
import { logger } from "../../lib/logger";
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
    Session,
    VerifyEmailInput
} from "./auth.types";
import { AuthError } from "./auth.types";

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 15;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 1000 * 60 * 15;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 15;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 1000 * 60 * 15;

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function createSessionId(): string {
    return randomBytes(32).toString("hex");
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

async function createSessionForUser(userId: string): Promise<Session> {
    return authRepository.createSession({
        id: createSessionId(),
        userId,
        expiresAt: createSessionExpiry()
    });
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
        const availableAt = new Date(
            latestToken.createdAt.getTime() +
                EMAIL_VERIFICATION_RESEND_COOLDOWN_MS
        );

        throw new AuthError(
            429,
            `A verification email was already sent recently. Please try again after ${availableAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
        );
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
    async register(input: RegisterInput) {
        const email = normalizeEmail(input.email);
        const existingUser = await usersRepository.findByEmail(email);

        if (existingUser) {
            throw new AuthError(
                409,
                "An account with this email already exists."
            );
        }

        const passwordHash = await hashPassword(input.password);
        const user = await usersRepository.create({
            email,
            name: input.name,
            passwordHash
        });
        const session = await createSessionForUser(user.id);
        await sendVerificationEmail(user);

        return {
            user: toPublicUser(user),
            session
        };
    },

    async login(input: LoginInput) {
        const email = normalizeEmail(input.email);
        const user = await usersRepository.findByEmail(email);

        if (!user) {
            throw new AuthError(401, "Invalid email or password.");
        }

        const isValidPassword = await verifyPassword(
            input.password,
            user.passwordHash
        );

        if (!isValidPassword) {
            throw new AuthError(401, "Invalid email or password.");
        }

        if (!user.emailVerifiedAt) {
            throw new AuthError(
                403,
                "Please verify your email before signing in."
            );
        }

        const session = await createSessionForUser(user.id);

        return {
            user: toPublicUser(user),
            session
        };
    },

    async logout(request: Request) {
        const sessionId = getSessionIdFromRequest(request);

        if (!sessionId) {
            return;
        }

        await authRepository.deleteSession(sessionId);
    },

    async getCurrentUser(request: Request) {
        const sessionId = getSessionIdFromRequest(request);

        if (!sessionId) {
            return null;
        }

        const session = await authRepository.findSessionById(sessionId);

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

    async verifyEmail(input: VerifyEmailInput) {
        const token = input.token.trim();

        if (!token) {
            throw new AuthError(400, "Verification token is required.");
        }

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
        const session = await createSessionForUser(user.id);

        return {
            user: toPublicUser(verifiedUser),
            session
        };
    },

    async resendVerification(request: Request, input: ResendVerificationInput) {
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

        const user = await usersRepository.findByEmail(email);

        if (user && !user.emailVerifiedAt) {
            await sendVerificationEmail(user);
        }

        return { success: true };
    },

    async forgotPassword(input: ForgotPasswordInput) {
        const email = normalizeEmail(input.email);
        const user = await usersRepository.findByEmail(email);

        if (user) {
            await sendPasswordResetEmail(user);
        }

        return { success: true };
    },

    async resetPassword(input: ResetPasswordInput) {
        const token = input.token.trim();

        if (!token) {
            throw new AuthError(400, "Reset token is required.");
        }

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
