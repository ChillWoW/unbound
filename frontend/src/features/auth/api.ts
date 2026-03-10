import api from "@/lib/api";
import type {
    AuthSuccessResponse,
    CurrentUserResponse,
    LoginInput,
    LogoutResponse,
    ResendVerificationInput,
    ResendVerificationResponse,
    RegisterInput
} from "./types";

export const authApi = {
    login(input: LoginInput) {
        return api.post<AuthSuccessResponse>("/api/auth/login", {
            body: input
        });
    },

    logout() {
        return api.post<LogoutResponse>("/api/auth/logout");
    },

    me() {
        return api.get<CurrentUserResponse>("/api/auth/me");
    },

    resendVerification(input: ResendVerificationInput = {}) {
        return api.post<ResendVerificationResponse>(
            "/api/auth/resend-verification",
            {
                body: input
            }
        );
    },

    register(input: RegisterInput) {
        return api.post<AuthSuccessResponse>("/api/auth/register", {
            body: input
        });
    },

    verifyEmail(token: string) {
        return api.post<AuthSuccessResponse>("/api/auth/verify-email", {
            body: { token }
        });
    }
};
