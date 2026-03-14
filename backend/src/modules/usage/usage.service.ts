import { requireAuth } from "../../middleware/require-auth";
import { logger } from "../../lib/logger";
import { usageRepository, type DateRange } from "./usage.repository";
import { getCachedModel } from "../models/models.cache";
import { getDirectProviderModels } from "../models/direct-provider-models";
import type { ProviderType } from "../../lib/provider-registry";

interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

interface ModelPricing {
    promptPricePerToken: string | null;
    completionPricePerToken: string | null;
}

function computeCostMicros(tokens: number, pricePerToken: string | null): number {
    if (!pricePerToken) return 0;
    const price = parseFloat(pricePerToken);
    if (isNaN(price) || price <= 0) return 0;
    return Math.round(tokens * price * 1_000_000);
}

export const usageService = {
    async recordUsage(
        userId: string,
        conversationId: string,
        messageId: string,
        modelId: string,
        provider: string,
        usage: TokenUsage,
        pricing: ModelPricing
    ) {
        try {
            const inputCostMicros = computeCostMicros(
                usage.promptTokens,
                pricing.promptPricePerToken
            );
            const outputCostMicros = computeCostMicros(
                usage.completionTokens,
                pricing.completionPricePerToken
            );

            await usageRepository.insert({
                userId,
                conversationId,
                messageId,
                modelId,
                provider,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
                inputCostMicros,
                outputCostMicros,
                totalCostMicros: inputCostMicros + outputCostMicros,
                promptPricePerToken: pricing.promptPricePerToken,
                completionPricePerToken: pricing.completionPricePerToken
            });

            logger.info("Usage record saved", {
                userId,
                conversationId,
                messageId,
                modelId,
                provider,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalCostMicros: inputCostMicros + outputCostMicros
            });
        } catch (error) {
            logger.error("Failed to save usage record", {
                userId,
                conversationId,
                messageId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    },

    async checkBudget(userId: string) {
        const budget = await usageRepository.getBudgetSettings(userId);
        if (!budget.monthlyBudgetCents) {
            return {
                withinBudget: true,
                percentUsed: 0,
                monthlySpendCents: 0,
                monthlyLimitCents: null,
                alertThreshold: budget.budgetAlertThreshold
            };
        }

        const monthlySpendMicros =
            await usageRepository.getCurrentMonthSpend(userId);
        const monthlySpendCents = Math.round(monthlySpendMicros / 10_000);
        const percentUsed = Math.round(
            (monthlySpendCents / budget.monthlyBudgetCents) * 100
        );

        return {
            withinBudget: monthlySpendCents <= budget.monthlyBudgetCents,
            percentUsed,
            monthlySpendCents,
            monthlyLimitCents: budget.monthlyBudgetCents,
            alertThreshold: budget.budgetAlertThreshold
        };
    },

    getModelPricing(
        userId: string,
        modelId: string,
        provider?: ProviderType
    ): ModelPricing {
        const cached = getCachedModel(userId, modelId);
        if (cached?.promptPricing || cached?.completionPricing) {
            return {
                promptPricePerToken: cached.promptPricing ?? null,
                completionPricePerToken: cached.completionPricing ?? null
            };
        }

        if (provider && provider !== "openrouter") {
            const directModel = getDirectProviderModels(provider).find(
                (m) => m.id === modelId
            );
            if (directModel) {
                return {
                    promptPricePerToken: directModel.promptPricing ?? null,
                    completionPricePerToken:
                        directModel.completionPricing ?? null
                };
            }
        }

        return {
            promptPricePerToken: null,
            completionPricePerToken: null
        };
    },

    async getSummary(request: Request, range: DateRange) {
        const user = await requireAuth(request);
        const summary = await usageRepository.getSummary(user.id, range);
        const budget = await this.checkBudget(user.id);
        return { ...summary, budget };
    },

    async getByModel(request: Request, range: DateRange) {
        const user = await requireAuth(request);
        return usageRepository.getByModel(user.id, range);
    },

    async getByConversation(
        request: Request,
        range: DateRange,
        limit: number
    ) {
        const user = await requireAuth(request);
        return usageRepository.getByConversation(user.id, range, limit);
    },

    async getDailySpend(request: Request, from: string, to: string) {
        const user = await requireAuth(request);
        return usageRepository.getDailySpend(
            user.id,
            new Date(from),
            new Date(to)
        );
    },

    async getBudget(request: Request) {
        const user = await requireAuth(request);
        return this.checkBudget(user.id);
    },

    async updateBudget(
        request: Request,
        monthlyBudgetCents: number | null,
        budgetAlertThreshold: number
    ) {
        const user = await requireAuth(request);
        const settings = await usageRepository.updateBudgetSettings(
            user.id,
            monthlyBudgetCents,
            budgetAlertThreshold
        );
        const budgetStatus = await this.checkBudget(user.id);
        return { settings, budget: budgetStatus };
    }
};
