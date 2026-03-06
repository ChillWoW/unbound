import api from "@/lib/api";
import type {
    AuthSuccessResponse,
    CurrentUserResponse,
    LoginInput,
    LogoutResponse,
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

    register(input: RegisterInput) {
        return api.post<AuthSuccessResponse>("/api/auth/register", {
            body: input
        });
    }
};
