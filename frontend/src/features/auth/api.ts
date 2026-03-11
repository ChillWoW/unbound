import api from "@/lib/api";
import type {
    AuthSuccessResponse,
    CurrentUserResponse,
    ForgotPasswordInput,
    ForgotPasswordResponse,
    LoginInput,
    LogoutResponse,
    RegisterResponse,
    ResendVerificationInput,
    ResendVerificationResponse,
    RegisterInput,
    ResetPasswordInput,
    ResetPasswordResponse
} from "./types";

export const authApi = {
    forgotPassword(input: ForgotPasswordInput) {
        return api.post<ForgotPasswordResponse>("/api/auth/forgot-password", {
            body: input
        });
    },

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
        return api.post<RegisterResponse>("/api/auth/register", {
            body: input
        });
    },

    resetPassword(input: ResetPasswordInput) {
        return api.post<ResetPasswordResponse>("/api/auth/reset-password", {
            body: input
        });
    },

    verifyEmail(token: string) {
        return api.post<AuthSuccessResponse>("/api/auth/verify-email", {
            body: { token }
        });
    }
};
