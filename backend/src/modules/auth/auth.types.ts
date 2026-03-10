import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sessions } from "../../db/schema";
import type { PublicUser } from "../users/users.types";

export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

export interface RegisterInput {
    email: string;
    password: string;
    name?: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export interface VerifyEmailInput {
    token: string;
}

export interface ForgotPasswordInput {
    email: string;
}

export interface ResetPasswordInput {
    token: string;
    password: string;
}

export interface ResendVerificationInput {
    email?: string;
}

export interface AuthSuccessResponse {
    user: PublicUser;
}

export interface CurrentUserResponse {
    user: PublicUser | null;
}

export interface VerificationSuccessResponse {
    user: PublicUser;
}

export interface ResendVerificationResponse {
    success: boolean;
}

export interface ForgotPasswordResponse {
    success: boolean;
}

export interface ResetPasswordResponse {
    success: boolean;
}

export class AuthError extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message);
        this.name = "AuthError";
    }
}
