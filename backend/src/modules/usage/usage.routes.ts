import { Elysia, t } from "elysia";
import { UnauthorizedError } from "../../middleware/require-auth";
import { usageService } from "./usage.service";
import type { DateRange } from "./usage.repository";

const rangeQuery = t.Object({
    range: t.Optional(
        t.Union([
            t.Literal("day"),
            t.Literal("week"),
            t.Literal("month"),
            t.Literal("all")
        ])
    )
});

const dailyQuery = t.Object({
    from: t.String(),
    to: t.String()
});

const conversationQuery = t.Object({
    range: t.Optional(
        t.Union([
            t.Literal("day"),
            t.Literal("week"),
            t.Literal("month"),
            t.Literal("all")
        ])
    ),
    limit: t.Optional(t.String())
});

const budgetBody = t.Object({
    monthlyBudgetCents: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    budgetAlertThreshold: t.Number({ minimum: 1, maximum: 100 })
});

function handleUsageError(
    error: unknown,
    set: { status?: number | string }
) {
    if (error instanceof UnauthorizedError) {
        set.status = error.status;
        return { message: error.message };
    }
    throw error;
}

export const usageRoutes = new Elysia({ prefix: "/api/usage" })
    .get(
        "/summary",
        async ({ query, request, set }) => {
            try {
                const range: DateRange = (query.range as DateRange) || "month";
                return await usageService.getSummary(request, range);
            } catch (error) {
                return handleUsageError(error, set);
            }
        },
        { query: rangeQuery }
    )
    .get(
        "/by-model",
        async ({ query, request, set }) => {
            try {
                const range: DateRange = (query.range as DateRange) || "month";
                const models = await usageService.getByModel(request, range);
                return { models };
            } catch (error) {
                return handleUsageError(error, set);
            }
        },
        { query: rangeQuery }
    )
    .get(
        "/by-conversation",
        async ({ query, request, set }) => {
            try {
                const range: DateRange = (query.range as DateRange) || "month";
                const limit = query.limit ? parseInt(query.limit, 10) : 20;
                const convos = await usageService.getByConversation(
                    request,
                    range,
                    limit
                );
                return { conversations: convos };
            } catch (error) {
                return handleUsageError(error, set);
            }
        },
        { query: conversationQuery }
    )
    .get(
        "/daily",
        async ({ query, request, set }) => {
            try {
                const days = await usageService.getDailySpend(
                    request,
                    query.from,
                    query.to
                );
                return { days };
            } catch (error) {
                return handleUsageError(error, set);
            }
        },
        { query: dailyQuery }
    )
    .get("/budget", async ({ request, set }) => {
        try {
            return await usageService.getBudget(request);
        } catch (error) {
            return handleUsageError(error, set);
        }
    })
    .put(
        "/budget",
        async ({ body, request, set }) => {
            try {
                return await usageService.updateBudget(
                    request,
                    body.monthlyBudgetCents,
                    body.budgetAlertThreshold
                );
            } catch (error) {
                return handleUsageError(error, set);
            }
        },
        { body: budgetBody }
    );
