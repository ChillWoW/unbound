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

export interface ForgotPasswordInput {
    email: string;
}

export interface ResetPasswordInput {
    token: string;
    password: string;
}

export interface AuthSuccessResponse {
    user: AuthUser;
}

export interface RegisterResponse {
    user: AuthUser | null;
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

export interface ForgotPasswordResponse {
    success: boolean;
}

export interface ResetPasswordResponse {
    success: boolean;
}

export interface AuthContextValue {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isVerified: boolean;
    isLoading: boolean;
    forgotPassword: (input: ForgotPasswordInput) => Promise<void>;
    login: (input: LoginInput) => Promise<AuthUser>;
    logout: () => Promise<void>;
    refresh: () => Promise<AuthUser | null>;
    register: (input: RegisterInput) => Promise<AuthUser | null>;
    resendVerification: (input?: ResendVerificationInput) => Promise<void>;
    resetPassword: (input: ResetPasswordInput) => Promise<void>;
    verifyEmail: (token: string) => Promise<AuthUser>;
}
