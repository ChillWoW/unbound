import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../middleware/require-auth";
import { memoryService } from "./memory.service";
import {
    MemoryError,
    isMemoryConfidence,
    isMemoryKind
} from "./memory.types";

const memoryParams = t.Object({
    memoryId: t.String({ minLength: 1, maxLength: 128 })
});

function handleMemoryError(
    error: unknown,
    set: { status?: number | string }
) {
    if (error instanceof UnauthorizedError) {
        set.status = error.status;
        return { message: error.message };
    }

    if (error instanceof MemoryError) {
        set.status = error.status;
        return { message: error.message };
    }

    throw error;
}

export const memoryRoutes = new Elysia({ prefix: "/api/memories" })
    .get("/", async ({ request, set }) => {
        try {
            const url = new URL(request.url);
            const query = url.searchParams.get("query")?.trim() || undefined;
            const kindParam = url.searchParams.get("kind")?.trim() || null;
            const minConfidenceParam =
                url.searchParams.get("minConfidence")?.trim() || null;
            const limitParam = url.searchParams.get("limit")?.trim() || null;

            if (kindParam && !isMemoryKind(kindParam)) {
                set.status = 400;
                return { message: `Invalid memory kind: ${kindParam}` };
            }

            if (
                minConfidenceParam &&
                !isMemoryConfidence(minConfidenceParam)
            ) {
                set.status = 400;
                return {
                    message: `Invalid memory confidence: ${minConfidenceParam}`
                };
            }

            const parsedLimit = limitParam
                ? Number.parseInt(limitParam, 10)
                : undefined;

            if (
                limitParam &&
                (parsedLimit === undefined ||
                    !Number.isFinite(parsedLimit) ||
                    parsedLimit < 1)
            ) {
                set.status = 400;
                return { message: "Memory limit must be a positive integer." };
            }

            return await memoryService.listMemories(request, {
                query,
                kind: (kindParam ?? undefined) as
                    | "preference"
                    | "workflow"
                    | "profile"
                    | "project_context"
                    | undefined,
                minConfidence: (minConfidenceParam ?? undefined) as
                    | "low"
                    | "medium"
                    | "high"
                    | undefined,
                limit: parsedLimit
            });
        } catch (error) {
            return handleMemoryError(error, set);
        }
    })
    .delete(
        "/:memoryId",
        async ({ params, request, set }) => {
            try {
                return await memoryService.deleteMemory(request, params.memoryId);
            } catch (error) {
                return handleMemoryError(error, set);
            }
        },
        { params: memoryParams }
    );
