import { Elysia } from "elysia";
import { AppError } from "../../lib/app-error";
import { modelsService } from "./models.service";

function handleModelsError(
    error: unknown,
    set: { status?: number | string }
) {
    if (error instanceof AppError) {
        set.status = error.status;
        return { message: error.message };
    }

    throw error;
}

export const modelsRoutes = new Elysia({ prefix: "/api/models" }).get(
    "/",
    async ({ request, set }) => {
        try {
            const result = await modelsService.listModels(request);
            return {
                models: result.models,
                configuredProviders: result.configuredProviders
            };
        } catch (error) {
            return handleModelsError(error, set);
        }
    }
);
