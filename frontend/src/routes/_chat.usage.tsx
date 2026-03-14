import { useCallback, useEffect, useState } from "react";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from "recharts";
import {
    ChartBarIcon,
    CurrencyDollarIcon,
    LightningIcon,
    ChatCircleIcon,
    GearSixIcon,
    FloppyDiskIcon
} from "@phosphor-icons/react";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";
import { usageApi } from "@/features/usage/api";
import {
    formatCostFromMicros,
    formatCostFromCents,
    formatTokenCount,
    getModelShortName
} from "@/features/usage/format";
import type {
    DateRange,
    UsageSummary,
    ModelUsage,
    ConversationUsage,
    DailySpend,
    BudgetStatus
} from "@/features/usage/types";
import { cn } from "@/lib/cn";
import { notify } from "@/lib/toast";

export const Route = createFileRoute("/_chat/usage")({
    component: UsageDashboard
});

const RANGE_OPTIONS: { id: DateRange; label: string }[] = [
    { id: "day", label: "Today" },
    { id: "week", label: "7 Days" },
    { id: "month", label: "This Month" },
    { id: "all", label: "All Time" }
];

const CHART_COLORS = [
    "#34d399",
    "#60a5fa",
    "#f59e0b",
    "#a78bfa",
    "#f472b6",
    "#38bdf8",
    "#fb923c",
    "#4ade80"
];

interface SummaryCardProps {
    label: string;
    value: string;
    icon: React.ReactNode;
    subtext?: string;
}

function SummaryCard({ label, value, icon, subtext }: SummaryCardProps) {
    return (
        <div className="rounded-lg border border-dark-600 bg-dark-900 p-4">
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-xs text-dark-400 uppercase tracking-wider">
                    {label}
                </span>
            </div>
            <p className="text-2xl font-semibold text-white">{value}</p>
            {subtext && (
                <p className="text-xs text-dark-400 mt-1">{subtext}</p>
            )}
        </div>
    );
}

function CustomTooltip({
    active,
    payload,
    label
}: {
    active?: boolean;
    payload?: Array<{ value: number; name: string }>;
    label?: string;
}) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-md border border-dark-600 bg-dark-850 px-3 py-2 shadow-lg">
            <p className="text-xs text-dark-300 mb-1">{label}</p>
            {payload.map((entry, i) => (
                <p key={i} className="text-sm text-white">
                    {entry.name === "cost"
                        ? formatCostFromMicros(entry.value)
                        : formatTokenCount(entry.value)}
                </p>
            ))}
        </div>
    );
}

function getDailyRange(): { from: string; to: string } {
    const to = new Date();
    to.setDate(to.getDate() + 1);
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return {
        from: from.toISOString().split("T")[0],
        to: to.toISOString().split("T")[0]
    };
}

function UsageDashboard() {
    const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const [range, setRange] = useState<DateRange>("month");
    const [summary, setSummary] = useState<UsageSummary | null>(null);
    const [models, setModels] = useState<ModelUsage[]>([]);
    const [conversations, setConversations] = useState<ConversationUsage[]>([]);
    const [dailyData, setDailyData] = useState<DailySpend[]>([]);
    const [budget, setBudget] = useState<BudgetStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [budgetInput, setBudgetInput] = useState("");
    const [thresholdInput, setThresholdInput] = useState("80");
    const [isSavingBudget, setIsSavingBudget] = useState(false);

    const loadData = useCallback(
        async (r: DateRange) => {
            if (!isAuthenticated) return;
            setIsLoading(true);
            try {
                const { from, to } = getDailyRange();
                const [summaryRes, modelsRes, convoRes, dailyRes] =
                    await Promise.all([
                        usageApi.getSummary(r),
                        usageApi.getByModel(r),
                        usageApi.getByConversation(r, 20),
                        usageApi.getDailySpend(from, to)
                    ]);
                setSummary(summaryRes);
                setModels(modelsRes.models);
                setConversations(convoRes.conversations);
                setDailyData(dailyRes.days);
                setBudget(summaryRes.budget);

                if (summaryRes.budget.monthlyLimitCents) {
                    setBudgetInput(
                        (summaryRes.budget.monthlyLimitCents / 100).toString()
                    );
                } else {
                    setBudgetInput("");
                }
                setThresholdInput(
                    summaryRes.budget.alertThreshold.toString()
                );
            } catch {
                /* keep stale data */
            } finally {
                setIsLoading(false);
            }
        },
        [isAuthenticated]
    );

    useEffect(() => {
        void loadData(range);
    }, [range, loadData]);

    async function handleSaveBudget() {
        setIsSavingBudget(true);
        try {
            const cents = budgetInput.trim()
                ? Math.round(parseFloat(budgetInput) * 100)
                : null;
            const threshold = Math.max(
                1,
                Math.min(100, parseInt(thresholdInput, 10) || 80)
            );
            const res = await usageApi.updateBudget(cents, threshold);
            setBudget(res.budget);
            notify.success({
                title: "Budget updated",
                description: cents
                    ? `Monthly limit set to $${(cents / 100).toFixed(2)}`
                    : "Budget limit removed"
            });
        } catch {
            notify.error({
                title: "Failed to save budget",
                description: "Please try again."
            });
        } finally {
            setIsSavingBudget(false);
        }
    }

    if (!isAuthLoading && !isAuthenticated) {
        return <Navigate to="/login" />;
    }

    const chartData = dailyData.map((d) => ({
        date: new Date(d.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric"
        }),
        cost: d.totalCostMicros,
        tokens: d.totalTokens
    }));

    const modelChartData = models.slice(0, 8).map((m) => ({
        name: getModelShortName(m.modelId),
        cost: m.totalCostMicros,
        tokens: m.totalTokens
    }));

    const hasBudget = budget?.monthlyLimitCents != null;
    const budgetPercent = hasBudget ? Math.min(budget!.percentUsed, 100) : 0;
    const budgetBarColor =
        (budget?.percentUsed ?? 0) >= 100
            ? "bg-red-500"
            : (budget?.percentUsed ?? 0) >= (budget?.alertThreshold ?? 80)
              ? "bg-amber-500"
              : "bg-emerald-500";

    return (
        <div className="flex h-full overflow-y-auto">
            <div className="w-full max-w-5xl mx-auto px-4 py-8 sm:px-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
                            <ChartBarIcon
                                className="size-5 text-emerald-400"
                                weight="fill"
                            />
                            Usage Dashboard
                        </h1>
                        <p className="text-sm text-dark-200">
                            Track token usage, costs, and manage your budget.
                        </p>
                    </div>
                    <div className="flex gap-1.5">
                        {RANGE_OPTIONS.map((opt) => (
                            <Button
                                key={opt.id}
                                type="button"
                                size="sm"
                                variant="primary"
                                onClick={() => setRange(opt.id)}
                                className={cn(
                                    opt.id !== range &&
                                        "bg-dark-900 border border-dark-600 hover:bg-dark-800 text-dark-200 hover:text-dark-50"
                                )}
                            >
                                {opt.label}
                            </Button>
                        ))}
                    </div>
                </div>

                {isLoading && !summary ? (
                    <div className="flex items-center justify-center py-20">
                        <p className="text-sm text-dark-300">
                            Loading usage data...
                        </p>
                    </div>
                ) : !summary ? (
                    <div className="rounded-md border border-dark-600 bg-dark-900/60 px-4 py-12 text-center">
                        <p className="text-sm text-dark-300">
                            No usage data yet. Start chatting to see your token
                            usage and costs here.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <SummaryCard
                                label="Total Spend"
                                value={formatCostFromMicros(
                                    summary.totalCostMicros
                                )}
                                icon={
                                    <CurrencyDollarIcon className="size-4 text-emerald-400" />
                                }
                                subtext={`${summary.recordCount} generations`}
                            />
                            <SummaryCard
                                label="Tokens Used"
                                value={formatTokenCount(summary.totalTokens)}
                                icon={
                                    <LightningIcon className="size-4 text-amber-400" />
                                }
                                subtext={`${formatTokenCount(summary.totalPromptTokens)} in / ${formatTokenCount(summary.totalCompletionTokens)} out`}
                            />
                            <SummaryCard
                                label="Models Used"
                                value={models.length.toString()}
                                icon={
                                    <GearSixIcon className="size-4 text-blue-400" />
                                }
                            />
                            <SummaryCard
                                label="Conversations"
                                value={conversations.length.toString()}
                                icon={
                                    <ChatCircleIcon className="size-4 text-purple-400" />
                                }
                                subtext={
                                    conversations.length > 0 && summary.recordCount > 0
                                        ? `~${formatCostFromMicros(Math.round(summary.totalCostMicros / conversations.length))} avg`
                                        : undefined
                                }
                            />
                        </div>

                        {/* Budget Bar */}
                        {hasBudget && (
                            <div className="rounded-lg border border-dark-600 bg-dark-900 p-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-dark-200">
                                        Monthly Budget
                                    </span>
                                    <span
                                        className={cn(
                                            "font-medium",
                                            budget!.percentUsed >= 100
                                                ? "text-red-400"
                                                : budget!.percentUsed >=
                                                    budget!.alertThreshold
                                                  ? "text-amber-400"
                                                  : "text-emerald-400"
                                        )}
                                    >
                                        {formatCostFromCents(
                                            budget!.monthlySpendCents
                                        )}{" "}
                                        /{" "}
                                        {formatCostFromCents(
                                            budget!.monthlyLimitCents!
                                        )}
                                        {" "}({budget!.percentUsed}%)
                                    </span>
                                </div>
                                <div className="h-3 rounded-full bg-dark-700 overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all duration-500",
                                            budgetBarColor
                                        )}
                                        style={{
                                            width: `${budgetPercent}%`
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Daily Spend Chart */}
                        {chartData.length > 0 && (
                            <div className="rounded-lg border border-dark-600 bg-dark-900 p-4">
                                <h2 className="text-sm font-medium text-white mb-4">
                                    Daily Spend (Last 30 Days)
                                </h2>
                                <div className="h-64">
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <AreaChart data={chartData}>
                                            <defs>
                                                <linearGradient
                                                    id="costGradient"
                                                    x1="0"
                                                    y1="0"
                                                    x2="0"
                                                    y2="1"
                                                >
                                                    <stop
                                                        offset="5%"
                                                        stopColor="#34d399"
                                                        stopOpacity={0.3}
                                                    />
                                                    <stop
                                                        offset="95%"
                                                        stopColor="#34d399"
                                                        stopOpacity={0}
                                                    />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke="#2e2e2e"
                                            />
                                            <XAxis
                                                dataKey="date"
                                                tick={{
                                                    fill: "#696969",
                                                    fontSize: 12
                                                }}
                                                axisLine={{
                                                    stroke: "#2e2e2e"
                                                }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tickFormatter={(v: number) =>
                                                    formatCostFromMicros(v)
                                                }
                                                tick={{
                                                    fill: "#696969",
                                                    fontSize: 12
                                                }}
                                                axisLine={{
                                                    stroke: "#2e2e2e"
                                                }}
                                                tickLine={false}
                                                width={60}
                                            />
                                            <Tooltip
                                                content={<CustomTooltip />}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="cost"
                                                name="cost"
                                                stroke="#34d399"
                                                fill="url(#costGradient)"
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* Cost by Model */}
                        {modelChartData.length > 0 && (
                            <div className="rounded-lg border border-dark-600 bg-dark-900 p-4">
                                <h2 className="text-sm font-medium text-white mb-4">
                                    Cost by Model
                                </h2>
                                <div
                                    className="overflow-x-auto"
                                    style={{
                                        height: Math.max(
                                            200,
                                            modelChartData.length * 40 + 40
                                        )
                                    }}
                                >
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <BarChart
                                            data={modelChartData}
                                            layout="vertical"
                                            margin={{ left: 10 }}
                                        >
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke="#2e2e2e"
                                                horizontal={false}
                                            />
                                            <XAxis
                                                type="number"
                                                tickFormatter={(v: number) =>
                                                    formatCostFromMicros(v)
                                                }
                                                tick={{
                                                    fill: "#696969",
                                                    fontSize: 12
                                                }}
                                                axisLine={{
                                                    stroke: "#2e2e2e"
                                                }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                tick={{
                                                    fill: "#b8b8b8",
                                                    fontSize: 12
                                                }}
                                                axisLine={false}
                                                tickLine={false}
                                                width={140}
                                            />
                                            <Tooltip
                                                content={<CustomTooltip />}
                                            />
                                            <Bar
                                                dataKey="cost"
                                                name="cost"
                                                radius={[0, 4, 4, 0]}
                                            >
                                                {modelChartData.map(
                                                    (_, idx) => (
                                                        <Cell
                                                            key={idx}
                                                            fill={
                                                                CHART_COLORS[
                                                                    idx %
                                                                        CHART_COLORS.length
                                                                ]
                                                            }
                                                        />
                                                    )
                                                )}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* Cost by Conversation Table */}
                        {conversations.length > 0 && (
                            <div className="rounded-lg border border-dark-600 bg-dark-900 p-4">
                                <h2 className="text-sm font-medium text-white mb-4">
                                    Cost by Conversation
                                </h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-dark-600">
                                                <th className="text-left py-2 pr-4 text-dark-300 font-medium">
                                                    Conversation
                                                </th>
                                                <th className="text-right py-2 px-4 text-dark-300 font-medium">
                                                    Tokens
                                                </th>
                                                <th className="text-right py-2 pl-4 text-dark-300 font-medium">
                                                    Cost
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {conversations.map((convo) => (
                                                <tr
                                                    key={
                                                        convo.conversationId
                                                    }
                                                    className="border-b border-dark-700 last:border-b-0"
                                                >
                                                    <td className="py-2.5 pr-4 text-dark-100 truncate max-w-xs">
                                                        {convo.conversationTitle ??
                                                            "Untitled"}
                                                    </td>
                                                    <td className="py-2.5 px-4 text-dark-300 text-right tabular-nums">
                                                        {formatTokenCount(
                                                            convo.totalTokens
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 pl-4 text-white text-right tabular-nums font-medium">
                                                        {formatCostFromMicros(
                                                            convo.totalCostMicros
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Budget Settings */}
                        <div className="rounded-lg border border-dark-600 bg-dark-900 p-4 space-y-4">
                            <h2 className="text-sm font-medium text-white">
                                Budget Settings
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs text-dark-300">
                                        Monthly Budget ($)
                                    </label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="No limit"
                                        value={budgetInput}
                                        onChange={(e) =>
                                            setBudgetInput(e.target.value)
                                        }
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs text-dark-300">
                                        Alert Threshold (%)
                                    </label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={thresholdInput}
                                        onChange={(e) =>
                                            setThresholdInput(e.target.value)
                                        }
                                    />
                                </div>
                            </div>
                            <Button
                                variant="primary"
                                onClick={() => void handleSaveBudget()}
                                disabled={isSavingBudget}
                            >
                                <FloppyDiskIcon className="size-4 mr-1.5" />
                                {isSavingBudget
                                    ? "Saving..."
                                    : "Save Budget"}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
