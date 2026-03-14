export type DateRange = "day" | "week" | "month" | "all";

export interface BudgetStatus {
    withinBudget: boolean;
    percentUsed: number;
    monthlySpendCents: number;
    monthlyLimitCents: number | null;
    alertThreshold: number;
}

export interface UsageSummary {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCostMicros: number;
    recordCount: number;
    budget: BudgetStatus;
}

export interface ModelUsage {
    modelId: string;
    provider: string;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCostMicros: number;
    recordCount: number;
}

export interface ConversationUsage {
    conversationId: string;
    conversationTitle: string | null;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCostMicros: number;
    recordCount: number;
}

export interface DailySpend {
    date: string;
    totalCostMicros: number;
    totalTokens: number;
}

export interface BudgetSettings {
    monthlyBudgetCents: number | null;
    budgetAlertThreshold: number;
}

export interface BudgetUpdateResponse {
    settings: BudgetSettings;
    budget: BudgetStatus;
}
