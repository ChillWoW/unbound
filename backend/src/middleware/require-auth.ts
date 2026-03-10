import { authService } from "../modules/auth/auth.service";
import type { PublicUser } from "../modules/users/users.types";

export class UnauthorizedError extends Error {
    readonly status: number;

    constructor(message = "Authentication required.", status = 401) {
        super(message);
        this.name = "UnauthorizedError";
        this.status = status;
    }
}

export async function requireAuth(request: Request): Promise<PublicUser> {
    const user = await authService.getCurrentUser(request);

    if (!user) {
        throw new UnauthorizedError();
    }

    return user;
}

export async function requireVerifiedAuth(request: Request): Promise<PublicUser> {
    const user = await requireAuth(request);

    if (!user.isEmailVerified) {
        throw new UnauthorizedError(
            "Please verify your email before using the app.",
            403
        );
    }

    return user;
}
