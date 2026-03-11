import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../middleware/require-auth";
import { settingsService } from "./settings.service";
import { SettingsError } from "./settings.types";
import { isValidProvider } from "../../lib/provider-registry";

const providerKeyBody = t.Object({
    apiKey: t.String({ minLength: 1, maxLength: 500 })
});

const providerParams = t.Object({
    provider: t.String({ minLength: 1, maxLength: 20 })
});

const memorySettingsBody = t.Object({
    enabled: t.Boolean(),
    minConfidence: t.Union([
        t.Literal("low"),
        t.Literal("medium"),
        t.Literal("high")
    ]),
    allowedKinds: t.Object({
        preference: t.Boolean(),
        workflow: t.Boolean(),
        profile: t.Boolean(),
        project_context: t.Boolean()
    }),
    customInstructions: t.String({ maxLength: 1000 })
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
        "/provider-keys/:provider",
        async ({ body, params, request, set }) => {
            if (!isValidProvider(params.provider)) {
                set.status = 400;
                return { message: `Invalid provider: ${params.provider}` };
            }

            try {
                const settings = await settingsService.setProviderApiKey(
                    request,
                    params.provider,
                    body
                );
                return { settings };
            } catch (error) {
                return handleSettingsError(error, set);
            }
        },
        {
            body: providerKeyBody,
            params: providerParams
        }
    )
    .delete(
        "/provider-keys/:provider",
        async ({ params, request, set }) => {
            if (!isValidProvider(params.provider)) {
                set.status = 400;
                return { message: `Invalid provider: ${params.provider}` };
            }

            try {
                const settings = await settingsService.clearProviderApiKey(
                    request,
                    params.provider
                );
                return { settings };
            } catch (error) {
                return handleSettingsError(error, set);
            }
        },
        {
            params: providerParams
        }
    )
    .put(
        "/memory",
        async ({ body, request, set }) => {
            try {
                const settings = await settingsService.updateMemorySettings(
                    request,
                    {
                        ...body,
                        customInstructions: body.customInstructions.trim() || null
                    }
                );

                return { settings };
            } catch (error) {
                return handleSettingsError(error, set);
            }
        },
        {
            body: memorySettingsBody
        }
    );
