import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import {
    emailVerificationTokens,
    passwordResetTokens,
    sessions
} from "../../db/schema";

export const authRepository = {
    async createSession(input: {
        id: string;
        userId: string;
        expiresAt: Date;
    }) {
        const [session] = await db
            .insert(sessions)
            .values({
                id: input.id,
                userId: input.userId,
                expiresAt: input.expiresAt
            })
            .returning();

        if (!session) {
            throw new Error("Failed to create session.");
        }

        return session;
    },

    async findSessionById(id: string) {
        const [session] = await db
            .select()
            .from(sessions)
            .where(eq(sessions.id, id))
            .limit(1);

        return session ?? null;
    },

    async deleteSession(id: string) {
        await db.delete(sessions).where(eq(sessions.id, id));
    },

    async deleteSessionsByUserId(userId: string) {
        await db.delete(sessions).where(eq(sessions.userId, userId));
    },

    async replaceEmailVerificationToken(input: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
    }) {
        await db
            .delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.userId, input.userId));

        const [token] = await db
            .insert(emailVerificationTokens)
            .values({
                userId: input.userId,
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt
            })
            .returning();

        if (!token) {
            throw new Error("Failed to create email verification token.");
        }

        return token;
    },

    async findValidEmailVerificationTokenByHash(tokenHash: string) {
        const [token] = await db
            .select()
            .from(emailVerificationTokens)
            .where(
                and(
                    eq(emailVerificationTokens.tokenHash, tokenHash),
                    isNull(emailVerificationTokens.consumedAt),
                    gt(emailVerificationTokens.expiresAt, new Date())
                )
            )
            .limit(1);

        return token ?? null;
    },

    async deleteEmailVerificationTokensForUser(userId: string) {
        await db
            .delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.userId, userId));
    },

    async findLatestEmailVerificationTokenForUser(userId: string) {
        const [token] = await db
            .select()
            .from(emailVerificationTokens)
            .where(eq(emailVerificationTokens.userId, userId))
            .orderBy(desc(emailVerificationTokens.createdAt))
            .limit(1);

        return token ?? null;
    },

    async replacePasswordResetToken(input: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
    }) {
        await db
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.userId, input.userId));

        const [token] = await db
            .insert(passwordResetTokens)
            .values({
                userId: input.userId,
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt
            })
            .returning();

        if (!token) {
            throw new Error("Failed to create password reset token.");
        }

        return token;
    },

    async findValidPasswordResetTokenByHash(tokenHash: string) {
        const [token] = await db
            .select()
            .from(passwordResetTokens)
            .where(
                and(
                    eq(passwordResetTokens.tokenHash, tokenHash),
                    isNull(passwordResetTokens.consumedAt),
                    gt(passwordResetTokens.expiresAt, new Date())
                )
            )
            .limit(1);

        return token ?? null;
    },

    async deletePasswordResetTokensForUser(userId: string) {
        await db
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.userId, userId));
    },

    async findLatestPasswordResetTokenForUser(userId: string) {
        const [token] = await db
            .select()
            .from(passwordResetTokens)
            .where(eq(passwordResetTokens.userId, userId))
            .orderBy(desc(passwordResetTokens.createdAt))
            .limit(1);

        return token ?? null;
    }
};
