import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { sessions } from "../../db/schema";

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
    }
};
