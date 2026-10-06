import type { Budget, Expense, HabitLog, HabitType, Wish } from "./types";

export type WishWithProgress = Wish & { habitLinkedProgress: number | null };

const HABIT_TYPES: HabitType[] = ["water", "exercise", "steps"];

// Same progress-fraction logic wishReminderScheduler uses for its one-time push nudge,
// duplicated here (not imported) since that function computes it inline rather than
// exporting it — reused conceptually, not literally shared code.
export function progressFractionForWish(wish: WishWithProgress): number | null {
  switch (wish.progressMode) {
    case "percentage":
      return wish.percentage !== undefined ? wish.percentage / 100 : null;
    case "milestone":
      if (!wish.milestones || wish.milestones.length === 0) return null;
      return wish.milestones.filter((m) => m.done).length / wish.milestones.length;
    case "quantity":
      if (!wish.quantityTarget) return null;
      return Math.min((wish.quantityCurrent ?? 0) / wish.quantityTarget, 1);
    case "habit_linked":
      return wish.habitLinkedProgress !== null ? wish.habitLinkedProgress / 100 : null;
    default:
      return null;
  }
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

// Falling-behind detection per wish — same elapsed-time-vs-progress comparison and 0.5/0.3
// thresholds wishReminderScheduler uses for its one-time push nudge, exposed here as an
// on-demand answer instead of only a background notification.
export function summarizeWishes(wishes: WishWithProgress[], now: Date) {
  return wishes
    .filter((w) => w.status === "active" && w.targetDate)
    .map((wish) => {
      const created = new Date(wish.createdAt);
      const targetAt = new Date(`${wish.targetDate}T23:59:59.000Z`);
      const totalMs = targetAt.getTime() - created.getTime();
      const elapsedFraction = totalMs > 0 ? Math.min((now.getTime() - created.getTime()) / totalMs, 1) : null;
      const progress = progressFractionForWish(wish);
      const fallingBehind =
        progress !== null &&
        elapsedFraction !== null &&
        elapsedFraction > 0.5 &&
        elapsedFraction - progress > 0.3;
      return {
        title: wish.title,
        targetDate: wish.targetDate,
        progressPercent: progress !== null ? Math.round(progress * 100) : null,
        elapsedPercent: elapsedFraction !== null ? Math.round(elapsedFraction * 100) : null,
        fallingBehind,
      };
    });
}

// Habit consistency — current streak (consecutive days ending today with status "done") and
// missed-day counts over the last 7/30 days, per habit.
export function summarizeHabits(habitLogs: HabitLog[], now: Date) {
  return HABIT_TYPES.map((type) => {
    const logsByDate = new Map(habitLogs.filter((h) => h.habitType === type).map((h) => [h.date, h]));
    let currentStreakDays = 0;
    for (let i = 0; ; i++) {
      const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
      const log = logsByDate.get(d);
      if (log && log.status === "done") currentStreakDays++;
      else break;
    }
    let missedInLast7Days = 0;
    let missedInLast30Days = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
      const log = logsByDate.get(d);
      const isMissed = !log || log.status !== "done";
      if (isMissed) {
        missedInLast30Days++;
        if (i < 7) missedInLast7Days++;
      }
    }
    return { habitType: type, currentStreakDays, missedInLast7Days, missedInLast30Days };
  });
}

// Budget pace projection — linear projection of this month's spend based on the daily rate
// so far, vs. each category's monthly limit.
export function summarizeBudgets(budgets: Budget[], expenses: Expense[], now: Date) {
  const dayOfMonth = now.getUTCDate();
  const totalDaysInMonth = daysInMonth(now.getUTCFullYear(), now.getUTCMonth());
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return budgets.map((budget) => {
    const spentSoFar = expenses
      .filter((e) => e.category === budget.category)
      .reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const projectedMonthEndTotal =
      dayOfMonth > 0 ? (spentSoFar / dayOfMonth) * totalDaysInMonth : spentSoFar;
    return {
      category: budget.category,
      monthlyLimit: budget.monthlyLimit,
      spentSoFar: round2(spentSoFar),
      // Deterministic, not left for the model to subtract itself.
      remainingThisMonth: round2(budget.monthlyLimit - spentSoFar),
      projectedMonthEndTotal: round2(projectedMonthEndTotal),
      projectedOverBy: round2(projectedMonthEndTotal - budget.monthlyLimit),
    };
  });
}

async function callApi(
  apiUrl: string,
  authHeader: string,
  path: string,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${apiUrl}${path}`, { headers: { Authorization: authHeader } });
  const text = await res.text().catch(() => "");
  const data = text ? JSON.parse(text) : undefined;
  return { status: res.status, data };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// HTTP-forwarding orchestrator — used by chatAssistant, which runs behind a Function URL and
// has no direct DynamoDB grants for the wishes/habits/budgets/expenses tables, so it re-calls
// the existing HTTP API with the caller's own forwarded bearer token instead. A plain HttpApi
// Lambda (see getProgressSummary) queries DynamoDB directly instead of using this — an
// HttpApi-routed function referencing its own HttpApi's invoke URL creates a genuine
// CloudFormation circular dependency (confirmed by a failed deploy, not theoretical).
export async function computeProgressSummary(apiUrl: string, authHeader: string): Promise<Record<string, unknown>> {
  const now = new Date();
  const todayStr = today();
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [wishesRes, habitsRes, budgetsRes, expensesRes] = await Promise.all([
    callApi(apiUrl, authHeader, "/wishes"),
    callApi(apiUrl, authHeader, `/habits?from=${thirtyDaysAgo}&to=${todayStr}`),
    callApi(apiUrl, authHeader, "/budgets"),
    callApi(apiUrl, authHeader, `/expenses?from=${monthStart}&to=${todayStr}`),
  ]);

  const wishes = (wishesRes.data as { wishes: WishWithProgress[] } | undefined)?.wishes ?? [];
  const habitLogs = (habitsRes.data as { habits: HabitLog[] } | undefined)?.habits ?? [];
  const budgets = (budgetsRes.data as { budgets: Budget[] } | undefined)?.budgets ?? [];
  const expenses = (expensesRes.data as { expenses: Expense[] } | undefined)?.expenses ?? [];

  return {
    todaysDate: todayStr,
    wishes: summarizeWishes(wishes, now),
    habits: summarizeHabits(habitLogs, now),
    budgets: summarizeBudgets(budgets, expenses, now),
  };
}
