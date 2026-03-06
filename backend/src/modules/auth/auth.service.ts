import { randomBytes } from "node:crypto";
import { env } from "../../config/env";
import { getSessionIdFromRequest } from "../../lib/cookies";
import { hashPassword, verifyPassword } from "../../lib/password";
import { usersRepository } from "../users/users.repository";
import { toPublicUser } from "../users/users.types";
import { authRepository } from "./auth.repository";
import type { LoginInput, RegisterInput, Session } from "./auth.types";
import { AuthError } from "./auth.types";

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function createSessionId(): string {
    return randomBytes(32).toString("hex");
}

function createSessionExpiry(): Date {
    return new Date(Date.now() + env.sessionMaxAgeSeconds * 1000);
}

async function createSessionForUser(userId: string): Promise<Session> {
    return authRepository.createSession({
        id: createSessionId(),
        userId,
        expiresAt: createSessionExpiry()
    });
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
    }
};
