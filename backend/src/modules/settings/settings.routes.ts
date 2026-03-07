import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../middleware/require-auth";
import { settingsService } from "./settings.service";
import { SettingsError } from "./settings.types";

const openRouterApiKeyBody = t.Object({
    apiKey: t.String({ minLength: 1, maxLength: 500 })
});

function handleSettingsError(
    error: unknown,
    set: { status?: number | string }
) {
    if (error instanceof UnauthorizedError) {
        set.status = error.status;
        return { message: error.message };
    }

    if (error instanceof SettingsError) {
        set.status = error.status;
        return { message: error.message };
    }

    throw error;
}

export const settingsRoutes = new Elysia({ prefix: "/api/settings" })
    .get("/", async ({ request, set }) => {
        try {
            const settings = await settingsService.getSettings(request);
            return { settings };
        } catch (error) {
            return handleSettingsError(error, set);
        }
    })
    .put(
        "/openrouter-key",
        async ({ body, request, set }) => {
            try {
                const settings = await settingsService.setOpenRouterApiKey(
                    request,
                    body
                );

                return { settings };
            } catch (error) {
                return handleSettingsError(error, set);
            }
        },
        {
            body: openRouterApiKeyBody
        }
    )
    .delete("/openrouter-key", async ({ request, set }) => {
        try {
            const settings =
                await settingsService.clearOpenRouterApiKey(request);

            return { settings };
        } catch (error) {
            return handleSettingsError(error, set);
        }
    });
