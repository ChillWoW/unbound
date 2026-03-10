export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    emailVerifiedAt: string | null;
    isEmailVerified: boolean;
    createdAt: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export interface RegisterInput extends LoginInput {
    name?: string;
}

export interface AuthSuccessResponse {
    user: AuthUser;
}

export interface ResendVerificationInput {
    email?: string;
}

export interface CurrentUserResponse {
    user: AuthUser | null;
}

export interface LogoutResponse {
    success: boolean;
}

export interface ResendVerificationResponse {
    success: boolean;
}

export interface AuthContextValue {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isVerified: boolean;
    isLoading: boolean;
    login: (input: LoginInput) => Promise<AuthUser>;
    logout: () => Promise<void>;
    refresh: () => Promise<AuthUser | null>;
    register: (input: RegisterInput) => Promise<AuthUser>;
    resendVerification: (input?: ResendVerificationInput) => Promise<void>;
    verifyEmail: (token: string) => Promise<AuthUser>;
}
