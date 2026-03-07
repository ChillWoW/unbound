import { authService } from "../modules/auth/auth.service";
import type { PublicUser } from "../modules/users/users.types";

export class UnauthorizedError extends Error {
    readonly status = 401;

    constructor(message = "Authentication required.") {
        super(message);
        this.name = "UnauthorizedError";
    }
}

export async function requireAuth(request: Request): Promise<PublicUser> {
    const user = await authService.getCurrentUser(request);

    if (!user) {
        throw new UnauthorizedError();
    }

    return user;
}
