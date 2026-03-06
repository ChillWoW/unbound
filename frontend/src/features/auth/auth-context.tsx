import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type PropsWithChildren
} from "react";
import { authApi } from "./api";
import type {
    AuthContextValue,
    AuthUser,
    LoginInput,
    RegisterInput
} from "./types";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

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

        async function loadCurrentUser() {
            try {
                const response = await authApi.me();

                if (isMounted) {
                    setUser(response.user);
                }
            } catch {
                if (isMounted) {
                    setUser(null);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void loadCurrentUser();

        return () => {
            isMounted = false;
        };
    }, []);

    const login = useCallback(async (input: LoginInput) => {
        const response = await authApi.login(input);
        setUser(response.user);
        return response.user;
    }, []);

    const register = useCallback(async (input: RegisterInput) => {
        const response = await authApi.register(input);
        setUser(response.user);
        return response.user;
    }, []);

    const logout = useCallback(async () => {
        await authApi.logout();
        setUser(null);
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            isAuthenticated: user !== null,
            isLoading,
            login,
            logout,
            refresh,
            register
        }),
        [isLoading, login, logout, refresh, register, user]
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
