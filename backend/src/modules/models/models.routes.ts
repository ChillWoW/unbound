import { Elysia } from "elysia";
import { ModelsError } from "./models.types";
import { modelsService } from "./models.service";

function handleModelsError(
    error: unknown,
    set: { status?: number | string }
) {
    if (error instanceof ModelsError) {
        set.status = error.status;
        return { message: error.message };
    }

    throw error;
}

export const modelsRoutes = new Elysia({ prefix: "/api/models" }).get(
    "/",
    async ({ request, set }) => {
        try {
            const models = await modelsService.listModels(request);
            return { models };
        } catch (error) {
            return handleModelsError(error, set);
        }
    }
);
