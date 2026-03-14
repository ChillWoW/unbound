import { api } from "@/lib/api";
import type {
    DateRange,
    UsageSummary,
    ModelUsage,
    ConversationUsage,
    DailySpend,
    BudgetStatus,
    BudgetUpdateResponse
} from "./types";

export const usageApi = {
    getSummary(range: DateRange = "month") {
        return api.get<UsageSummary>(`/api/usage/summary?range=${range}`);
    },

    getByModel(range: DateRange = "month") {
        return api.get<{ models: ModelUsage[] }>(
            `/api/usage/by-model?range=${range}`
        );
    },

    getByConversation(range: DateRange = "month", limit = 20) {
        return api.get<{ conversations: ConversationUsage[] }>(
            `/api/usage/by-conversation?range=${range}&limit=${limit}`
        );
    },

    getDailySpend(from: string, to: string) {
        return api.get<{ days: DailySpend[] }>(
            `/api/usage/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        );
    },

    getBudget() {
        return api.get<BudgetStatus>("/api/usage/budget");
    },

    updateBudget(
        monthlyBudgetCents: number | null,
        budgetAlertThreshold: number
    ) {
        return api.put<BudgetUpdateResponse>("/api/usage/budget", {
            body: { monthlyBudgetCents, budgetAlertThreshold }
        });
    }
};
