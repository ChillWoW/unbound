import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PropsWithChildren
} from "react";
import { authApi } from "./api";
import type {
    AuthContextValue,
    AuthUser,
    ForgotPasswordInput,
    LoginInput,
    RegisterInput,
    ResetPasswordInput
} from "./types";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const authGenRef = useRef(0);

    const refresh = useCallback(async () => {
        try {
            const response = await authApi.me();
            setUser(response.user);
            return response.user;
        } catch {
            setUser(null);
            return null;
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        const gen = ++authGenRef.current;

        async function loadCurrentUser() {
            try {
                const response = await authApi.me();

                if (isMounted && gen === authGenRef.current) {
                    setUser(response.user);
                }
            } catch {
                if (isMounted && gen === authGenRef.current) {
                    setUser(null);
                }
            } finally {
                if (isMounted && gen === authGenRef.current) {
                    setIsLoading(false);
                }
            }
        }

        void loadCurrentUser();

        return () => {
            isMounted = false;
        };
    }, []);

    const forgotPassword = useCallback(async (input: ForgotPasswordInput) => {
        await authApi.forgotPassword(input);
    }, []);

    const login = useCallback(async (input: LoginInput) => {
        const response = await authApi.login(input);
        authGenRef.current++;
        setUser(response.user);
        return response.user;
    }, []);

    const register = useCallback(async (input: RegisterInput) => {
        const response = await authApi.register(input);
        authGenRef.current++;
        setUser(response.user);
        return response.user;
    }, []);

    const resetPassword = useCallback(async (input: ResetPasswordInput) => {
        await authApi.resetPassword(input);
        authGenRef.current++;
        setUser(null);
    }, []);

    const logout = useCallback(async () => {
        await authApi.logout();
        authGenRef.current++;
        setUser(null);
    }, []);

    const resendVerification = useCallback(
        async (input?: { email?: string }) => {
            await authApi.resendVerification(input);
        },
        []
    );

    const verifyEmail = useCallback(async (token: string) => {
        const response = await authApi.verifyEmail(token);
        authGenRef.current++;
        setUser(response.user);
        return response.user;
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            isAuthenticated: user !== null,
            isVerified: user?.isEmailVerified ?? false,
            isLoading,
            forgotPassword,
            login,
            logout,
            refresh,
            register,
            resendVerification,
            resetPassword,
            verifyEmail
        }),
        [
            forgotPassword,
            isLoading,
            login,
            logout,
            refresh,
            register,
            resendVerification,
            resetPassword,
            user,
            verifyEmail
        ]
    );

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
}

export function useAuthContext() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuthContext must be used within AuthProvider.");
    }

    return context;
}
