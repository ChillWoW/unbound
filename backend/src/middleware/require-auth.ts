import { authService } from "../modules/auth/auth.service";
import type { PublicUser } from "../modules/users/users.types";

export async function requireAuth(request: Request): Promise<PublicUser> {
    const user = await authService.getCurrentUser(request);

    if (!user) {
        throw new Error("Authentication required.");
    }

    return user;
}
