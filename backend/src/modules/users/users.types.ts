import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { users } from "../../db/schema";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export interface PublicUser {
    id: string;
    email: string;
    name: string | null;
    emailVerifiedAt: string | null;
    isEmailVerified: boolean;
    createdAt: string;
}

export function toPublicUser(user: User): PublicUser {
    return {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        isEmailVerified: user.emailVerifiedAt !== null,
        createdAt: user.createdAt.toISOString()
    };
}
