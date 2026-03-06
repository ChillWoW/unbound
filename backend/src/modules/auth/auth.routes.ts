import { Elysia, t } from "elysia";
import { clearSessionCookie, createSessionCookie } from "../../lib/cookies";
import { authService } from "./auth.service";
import { AuthError } from "./auth.types";

const registerBody = t.Object({
    email: t.String({ format: "email", maxLength: 255 }),
    password: t.String({ minLength: 8, maxLength: 255 }),
    name: t.Optional(t.String({ minLength: 1, maxLength: 80 }))
});

const loginBody = t.Object({
    email: t.String({ format: "email", maxLength: 255 }),
    password: t.String({ minLength: 8, maxLength: 255 })
});

function setCookieHeader(
    headers: Record<string, string | number>,
    value: string
) {
    headers["set-cookie"] = value;
}

function handleAuthError(
    error: unknown,
    set: { headers: Record<string, string | number>; status?: number | string }
) {
    if (error instanceof AuthError) {
        set.status = error.status;
        return { message: error.message };
    }

    throw error;
}

export const authRoutes = new Elysia({ prefix: "/api/auth" })
    .post(
        "/register",
        async ({ body, set }) => {
            try {
                const result = await authService.register(body);

                setCookieHeader(
                    set.headers,
                    createSessionCookie(result.session.id)
                );

                return { user: result.user };
            } catch (error) {
                return handleAuthError(error, set);
            }
        },
        {
            body: registerBody
        }
    )
    .post(
        "/login",
        async ({ body, set }) => {
            try {
                const result = await authService.login(body);

                setCookieHeader(
                    set.headers,
                    createSessionCookie(result.session.id)
                );

                return { user: result.user };
            } catch (error) {
                return handleAuthError(error, set);
            }
        },
        {
            body: loginBody
        }
    )
    .post("/logout", async ({ request, set }) => {
        await authService.logout(request);
        setCookieHeader(set.headers, clearSessionCookie());

        return { success: true };
    })
    .get("/me", async ({ request, set }) => {
        const user = await authService.getCurrentUser(request);

        if (!user) {
            setCookieHeader(set.headers, clearSessionCookie());
        }

        return { user };
    });
