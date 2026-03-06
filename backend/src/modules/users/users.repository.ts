import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { users } from "../../db/schema";

export const usersRepository = {
    async create(input: {
        email: string;
        name?: string;
        passwordHash: string;
    }) {
        const [user] = await db
            .insert(users)
            .values({
                email: input.email,
                name: input.name?.trim() || null,
                passwordHash: input.passwordHash
            })
            .returning();

        if (!user) {
            throw new Error("Failed to create user.");
        }

        return user;
    },

    async findByEmail(email: string) {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        return user ?? null;
    },

    async findById(id: string) {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);

        return user ?? null;
    }
};
