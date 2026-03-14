import { and, between, eq, sql, desc, gte } from "drizzle-orm";
import { db } from "../../db/client";
import { usageRecords } from "../../db/schema/usage-records";
import { conversations } from "../../db/schema/conversations";
import { userSettings } from "../../db/schema/user-settings";

export interface InsertUsageRecord {
    userId: string;
    conversationId: string;
    messageId: string;
    modelId: string;
    provider: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    inputCostMicros: number;
    outputCostMicros: number;
    totalCostMicros: number;
    promptPricePerToken: string | null;
    completionPricePerToken: string | null;
}

export type DateRange = "day" | "week" | "month" | "all";

function getDateRangeStart(range: DateRange): Date | null {
    if (range === "all") return null;
    const now = new Date();
    switch (range) {
        case "day":
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        case "week": {
            const d = new Date(now);
            d.setDate(d.getDate() - 7);
            return d;
        }
        case "month":
            return new Date(now.getFullYear(), now.getMonth(), 1);
    }
}

function getCurrentMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

export const usageRepository = {
    async insert(record: InsertUsageRecord) {
        await db.insert(usageRecords).values(record);
    },

    async getSummary(userId: string, range: DateRange) {
        const rangeStart = getDateRangeStart(range);
        const conditions = [eq(usageRecords.userId, userId)];
        if (rangeStart) {
            conditions.push(gte(usageRecords.createdAt, rangeStart));
        }

        const [result] = await db
            .select({
                totalPromptTokens: sql<number>`coalesce(sum(${usageRecords.promptTokens}), 0)::int`,
                totalCompletionTokens: sql<number>`coalesce(sum(${usageRecords.completionTokens}), 0)::int`,
                totalTokens: sql<number>`coalesce(sum(${usageRecords.totalTokens}), 0)::int`,
                totalCostMicros: sql<number>`coalesce(sum(${usageRecords.totalCostMicros}), 0)::bigint`,
                recordCount: sql<number>`count(*)::int`
            })
            .from(usageRecords)
            .where(and(...conditions));

        return result;
    },

    async getByModel(userId: string, range: DateRange) {
        const rangeStart = getDateRangeStart(range);
        const conditions = [eq(usageRecords.userId, userId)];
        if (rangeStart) {
            conditions.push(gte(usageRecords.createdAt, rangeStart));
        }

        return db
            .select({
                modelId: usageRecords.modelId,
                provider: usageRecords.provider,
                totalPromptTokens: sql<number>`coalesce(sum(${usageRecords.promptTokens}), 0)::int`,
                totalCompletionTokens: sql<number>`coalesce(sum(${usageRecords.completionTokens}), 0)::int`,
                totalTokens: sql<number>`coalesce(sum(${usageRecords.totalTokens}), 0)::int`,
                totalCostMicros: sql<number>`coalesce(sum(${usageRecords.totalCostMicros}), 0)::bigint`,
                recordCount: sql<number>`count(*)::int`
            })
            .from(usageRecords)
            .where(and(...conditions))
            .groupBy(usageRecords.modelId, usageRecords.provider)
            .orderBy(desc(sql`sum(${usageRecords.totalCostMicros})`));
    },

    async getByConversation(userId: string, range: DateRange, limit = 20) {
        const rangeStart = getDateRangeStart(range);
        const conditions = [eq(usageRecords.userId, userId)];
        if (rangeStart) {
            conditions.push(gte(usageRecords.createdAt, rangeStart));
        }

        return db
            .select({
                conversationId: usageRecords.conversationId,
                conversationTitle: conversations.title,
                totalPromptTokens: sql<number>`coalesce(sum(${usageRecords.promptTokens}), 0)::int`,
                totalCompletionTokens: sql<number>`coalesce(sum(${usageRecords.completionTokens}), 0)::int`,
                totalTokens: sql<number>`coalesce(sum(${usageRecords.totalTokens}), 0)::int`,
                totalCostMicros: sql<number>`coalesce(sum(${usageRecords.totalCostMicros}), 0)::bigint`,
                recordCount: sql<number>`count(*)::int`
            })
            .from(usageRecords)
            .leftJoin(
                conversations,
                eq(usageRecords.conversationId, conversations.id)
            )
            .where(and(...conditions))
            .groupBy(usageRecords.conversationId, conversations.title)
            .orderBy(desc(sql`sum(${usageRecords.totalCostMicros})`))
            .limit(limit);
    },

    async getDailySpend(userId: string, from: Date, to: Date) {
        return db
            .select({
                date: sql<string>`date_trunc('day', ${usageRecords.createdAt})::date::text`,
                totalCostMicros: sql<number>`coalesce(sum(${usageRecords.totalCostMicros}), 0)::bigint`,
                totalTokens: sql<number>`coalesce(sum(${usageRecords.totalTokens}), 0)::int`
            })
            .from(usageRecords)
            .where(
                and(
                    eq(usageRecords.userId, userId),
                    between(usageRecords.createdAt, from, to)
                )
            )
            .groupBy(sql`date_trunc('day', ${usageRecords.createdAt})`)
            .orderBy(sql`date_trunc('day', ${usageRecords.createdAt})`);
    },

    async getCurrentMonthSpend(userId: string) {
        const monthStart = getCurrentMonthStart();
        const [result] = await db
            .select({
                totalCostMicros: sql<number>`coalesce(sum(${usageRecords.totalCostMicros}), 0)::bigint`
            })
            .from(usageRecords)
            .where(
                and(
                    eq(usageRecords.userId, userId),
                    gte(usageRecords.createdAt, monthStart)
                )
            );

        return result?.totalCostMicros ?? 0;
    },

    async getBudgetSettings(userId: string) {
        const [row] = await db
            .select({
                monthlyBudgetCents: userSettings.monthlyBudgetCents,
                budgetAlertThreshold: userSettings.budgetAlertThreshold
            })
            .from(userSettings)
            .where(eq(userSettings.userId, userId));

        return row ?? { monthlyBudgetCents: null, budgetAlertThreshold: 80 };
    },

    async updateBudgetSettings(
        userId: string,
        monthlyBudgetCents: number | null,
        budgetAlertThreshold: number
    ) {
        const existing = await db
            .select({ userId: userSettings.userId })
            .from(userSettings)
            .where(eq(userSettings.userId, userId))
            .limit(1);

        if (existing.length === 0) {
            await db.insert(userSettings).values({
                userId,
                monthlyBudgetCents,
                budgetAlertThreshold
            });
        } else {
            await db
                .update(userSettings)
                .set({
                    monthlyBudgetCents,
                    budgetAlertThreshold,
                    updatedAt: new Date()
                })
                .where(eq(userSettings.userId, userId));
        }

        return { monthlyBudgetCents, budgetAlertThreshold };
    }
};
