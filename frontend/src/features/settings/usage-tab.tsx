import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
    ArrowRightIcon,
    CurrencyDollarIcon,
    LightningIcon
} from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { usageApi } from "@/features/usage/api";
import {
    formatCostFromMicros,
    formatCostFromCents,
    formatTokenCount,
    getModelShortName
} from "@/features/usage/format";
import type { UsageSummary, ModelUsage } from "@/features/usage/types";
import { cn } from "@/lib/cn";

interface UsageTabProps {
    isActive: boolean;
}

export function UsageTab({ isActive }: UsageTabProps) {
    const [summary, setSummary] = useState<UsageSummary | null>(null);
    const [topModels, setTopModels] = useState<ModelUsage[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isActive) return;

        let cancelled = false;
        setIsLoading(true);

        Promise.all([
            usageApi.getSummary("month"),
            usageApi.getByModel("month")
        ])
            .then(([summaryData, modelData]) => {
                if (cancelled) return;
                setSummary(summaryData);
                setTopModels(modelData.models.slice(0, 3));
            })
            .catch(() => {
                /* silently fail, data just won't render */
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isActive]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-sm text-dark-300">Loading usage data...</p>
            </div>
        );
    }

    if (!summary) {
        return (
            <div className="rounded-md border border-dark-600 bg-dark-900/60 px-4 py-6 text-center">
                <p className="text-sm text-dark-300">
                    No usage data available yet. Start chatting to track your
                    token usage and costs.
                </p>
            </div>
        );
    }

    const budget = summary.budget;
    const hasBudget = budget.monthlyLimitCents !== null;
    const barPercent = hasBudget ? Math.min(budget.percentUsed, 100) : 0;
    const barColor =
        budget.percentUsed >= 100
            ? "bg-red-500"
            : budget.percentUsed >= budget.alertThreshold
              ? "bg-amber-500"
              : "bg-emerald-500";

    return (
        <div className="space-y-4">
            <div className="rounded-md border border-dark-600 bg-dark-900/60 px-4 py-3 text-sm text-dark-200">
                Quick summary of your current month's token usage and costs.
            </div>

            <div className="rounded-md border border-dark-600 bg-dark-900 p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <p className="text-xs text-dark-400 uppercase tracking-wider">
                            Monthly Spend
                        </p>
                        <p className="text-xl font-semibold text-white flex items-center gap-1.5">
                            <CurrencyDollarIcon className="size-5 text-emerald-400" />
                            {formatCostFromMicros(summary.totalCostMicros)}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-dark-400 uppercase tracking-wider">
                            Tokens Used
                        </p>
                        <p className="text-xl font-semibold text-white flex items-center gap-1.5">
                            <LightningIcon className="size-5 text-amber-400" />
                            {formatTokenCount(summary.totalTokens)}
                        </p>
                    </div>
                </div>

                {hasBudget && (
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-dark-300">
                                {formatCostFromCents(
                                    budget.monthlySpendCents
                                )}{" "}
                                of{" "}
                                {formatCostFromCents(
                                    budget.monthlyLimitCents!
                                )}{" "}
                                budget
                            </span>
                            <span
                                className={cn(
                                    "font-medium",
                                    budget.percentUsed >= 100
                                        ? "text-red-400"
                                        : budget.percentUsed >=
                                            budget.alertThreshold
                                          ? "text-amber-400"
                                          : "text-dark-200"
                                )}
                            >
                                {budget.percentUsed}%
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-dark-700 overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all",
                                    barColor
                                )}
                                style={{ width: `${barPercent}%` }}
                            />
                        </div>
                    </div>
                )}

                {topModels.length > 0 && (
                    <div className="space-y-2 pt-1">
                        <p className="text-xs text-dark-400 uppercase tracking-wider">
                            Top Models
                        </p>
                        {topModels.map((model) => (
                            <div
                                key={model.modelId}
                                className="flex items-center justify-between text-sm"
                            >
                                <span className="text-dark-200 truncate mr-3">
                                    {getModelShortName(model.modelId)}
                                </span>
                                <span className="text-dark-400 shrink-0">
                                    {formatCostFromMicros(
                                        model.totalCostMicros
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Link to="/usage" className="block">
                <Button variant="outline" className="w-full justify-center">
                    View detailed usage
                    <ArrowRightIcon className="size-4 ml-1.5" />
                </Button>
            </Link>
        </div>
    );
}
