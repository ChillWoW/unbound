export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
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

export interface CurrentUserResponse {
    user: AuthUser | null;
}

export interface LogoutResponse {
    success: boolean;
}

export interface AuthContextValue {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (input: LoginInput) => Promise<AuthUser>;
    logout: () => Promise<void>;
    refresh: () => Promise<AuthUser | null>;
    register: (input: RegisterInput) => Promise<AuthUser>;
}
