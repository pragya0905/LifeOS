import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import LineChart from "../components/LineChart";
import WeightTrend from "../components/WeightTrend";
import { toLocalDateStr } from "../lib/date";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_BAR, EXPENSE_CATEGORY_EMOJI, EXPENSE_CATEGORY_LABEL, formatINR } from "../lib/expenseCategories";
import type { Expense, HabitLog, Insights as InsightsData, LogEntry, ProgressSummary } from "../types";
import {
  card,
  errorText,
  mutedText,
  page,
  pageTitle,
  pillButton,
  pillButtonDone,
  pillButtonInactive,
  primaryButton,
  sectionLabel,
} from "../components/ui";

type Period = "day" | "week";

const TREND_DAYS = 14;
const WEEKLY_WEEKS = 8;
const WEEKLY_SPAN_DAYS = WEEKLY_WEEKS * 7;

function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toLocalDateStr(d);
}

// Buckets a date->value map into WEEKLY_WEEKS 7-day windows, oldest first. "sum" keeps the
// weekly total (used for spending, where a week's total is the meaningful number); "avg"
// divides by 7 so the unit stays comparable to the daily chart above it (ml, minutes, steps,
// mood rating) instead of ballooning into a 7x-larger number.
function weeklyBuckets(
  dailyValues: Map<string, number>,
  aggregate: "sum" | "avg",
): { date: string; value: number }[] {
  const buckets: { date: string; value: number }[] = [];
  for (let w = WEEKLY_WEEKS - 1; w >= 0; w--) {
    const oldestDaysAgo = w * 7 + 6;
    const newestDaysAgo = w * 7;
    let total = 0;
    for (let d = newestDaysAgo; d <= oldestDaysAgo; d++) {
      total += dailyValues.get(dateOffset(d)) ?? 0;
    }
    buckets.push({ date: dateOffset(oldestDaysAgo), value: aggregate === "avg" ? total / 7 : total });
  }
  return buckets;
}

export default function Insights() {
  const { request } = useApi();
  const [period, setPeriod] = useState<Period>("day");
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trendLoading, setTrendLoading] = useState(true);
  const [waterTrend, setWaterTrend] = useState<{ date: string; value: number }[]>([]);
  const [exerciseTrend, setExerciseTrend] = useState<{ date: string; value: number }[]>([]);
  const [stepsTrend, setStepsTrend] = useState<{ date: string; value: number }[]>([]);
  const [weightEntries, setWeightEntries] = useState<LogEntry[]>([]);
  const [moodTrend, setMoodTrend] = useState<{ date: string; value: number }[]>([]);
  const [spendingTrend, setSpendingTrend] = useState<{ date: string; value: number }[]>([]);

  const [waterWeekly, setWaterWeekly] = useState<{ date: string; value: number }[]>([]);
  const [exerciseWeekly, setExerciseWeekly] = useState<{ date: string; value: number }[]>([]);
  const [stepsWeekly, setStepsWeekly] = useState<{ date: string; value: number }[]>([]);
  const [moodWeekly, setMoodWeekly] = useState<{ date: string; value: number }[]>([]);
  const [spendingWeekly, setSpendingWeekly] = useState<{ date: string; value: number }[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ category: Expense["category"]; total: number }[]>([]);

  const [progressSummary, setProgressSummary] = useState<ProgressSummary | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadTrend() {
      setTrendLoading(true);
      try {
        // Fetch the full 8-week span once — both the 14-day daily charts and the 8-week
        // aggregated charts are sliced/bucketed from this same data, not fetched separately.
        const from = dateOffset(WEEKLY_SPAN_DAYS - 1);
        const to = dateOffset(0);
        const [habitsData, weightData, bodyFatData, moodData, expensesData] = await Promise.all([
          request<{ habits: HabitLog[] }>(`/habits?from=${from}&to=${to}`),
          request<{ entries: LogEntry[] }>(`/logs?logType=weight&from=${from}&to=${to}`),
          request<{ entries: LogEntry[] }>(`/logs?logType=bodyFat&from=${from}&to=${to}`),
          request<{ entries: LogEntry[] }>(`/logs?logType=mood&from=${from}&to=${to}`),
          request<{ expenses: Expense[] }>(`/expenses?from=${from}&to=${to}`),
        ]);
        if (ignore) return;

        const isWithinTrendWindow = (date: string) => date >= dateOffset(TREND_DAYS - 1);

        const byType = (type: HabitLog["habitType"]) => {
          const map = new Map<string, number>();
          for (const h of habitsData.habits) {
            if (h.habitType === type) map.set(h.date, h.value ?? 0);
          }
          return map;
        };
        const toSortedTrend = (map: Map<string, number>) =>
          [...map.entries()]
            .filter(([date]) => isWithinTrendWindow(date))
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => (a.date < b.date ? -1 : 1));

        const waterMap = byType("water");
        const exerciseMap = byType("exercise");
        const stepsMap = byType("steps");
        setWaterTrend(toSortedTrend(waterMap));
        setExerciseTrend(toSortedTrend(exerciseMap));
        setStepsTrend(toSortedTrend(stepsMap));
        setWaterWeekly(weeklyBuckets(waterMap, "avg"));
        setExerciseWeekly(weeklyBuckets(exerciseMap, "avg"));
        setStepsWeekly(weeklyBuckets(stepsMap, "avg"));

        setWeightEntries(
          [...weightData.entries, ...bodyFatData.entries].filter((e) => isWithinTrendWindow(e.date)),
        );

        const moodMap = new Map<string, number>();
        for (const e of moodData.entries) {
          if (e.data.rating !== undefined) moodMap.set(e.date, Number(e.data.rating));
        }
        setMoodTrend(toSortedTrend(moodMap));
        setMoodWeekly(weeklyBuckets(moodMap, "avg"));

        const spendByDate = new Map<string, number>();
        for (const expense of expensesData.expenses) {
          spendByDate.set(expense.date, (spendByDate.get(expense.date) ?? 0) + expense.amount);
        }
        const spendingDays: { date: string; value: number }[] = [];
        for (let i = TREND_DAYS - 1; i >= 0; i--) {
          const date = dateOffset(i);
          spendingDays.push({ date, value: spendByDate.get(date) ?? 0 });
        }
        setSpendingTrend(spendingDays);
        setSpendingWeekly(weeklyBuckets(spendByDate, "sum"));

        const spendByCategory = new Map<Expense["category"], number>();
        for (const expense of expensesData.expenses) {
          spendByCategory.set(expense.category, (spendByCategory.get(expense.category) ?? 0) + expense.amount);
        }
        setCategoryBreakdown(
          EXPENSE_CATEGORIES.map((category) => ({ category, total: spendByCategory.get(category) ?? 0 }))
            .filter((c) => c.total > 0)
            .sort((a, b) => b.total - a.total),
        );
      } catch {
        // Trend charts are a bonus view — the on-demand AI insights below still work.
      } finally {
        if (!ignore) setTrendLoading(false);
      }
    }
    loadTrend();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let ignore = false;
    request<ProgressSummary>("/progress-summary")
      .then((data) => {
        if (!ignore) setProgressSummary(data);
      })
      .catch(() => {
        // Optional card — the rest of the page still works without it.
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const data = await request<InsightsData>(`/insights?period=${period}`);
      setInsights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={page}>
      <h1 className={pageTitle}>Insights</h1>
      <p className={`mb-6 ${mutedText}`}>
        Generate an AI summary any time with Today or This week below. You'll also get a push
        notification with your weekly summary automatically, roughly once every 7 days.
      </p>

      {!trendLoading && (waterTrend.length > 0 || exerciseTrend.length > 0 || stepsTrend.length > 0) && (
        <div className={`mb-6 flex flex-col gap-4 sm:flex-row ${card}`}>
          {waterTrend.length > 0 && (
            <div className="flex-1">
              <h2 className={`mb-2 ${sectionLabel}`}>Water ({TREND_DAYS}d)</h2>
              <LineChart points={waterTrend} formatValue={(v) => `${(v / 1000).toFixed(1)}L`} />
            </div>
          )}
          {exerciseTrend.length > 0 && (
            <div className="flex-1">
              <h2 className={`mb-2 ${sectionLabel}`}>Exercise ({TREND_DAYS}d)</h2>
              <LineChart points={exerciseTrend} color="stroke-alert" formatValue={(v) => `${v}min`} />
            </div>
          )}
          {stepsTrend.length > 0 && (
            <div className="flex-1">
              <h2 className={`mb-2 ${sectionLabel}`}>Steps ({TREND_DAYS}d)</h2>
              <LineChart points={stepsTrend} color="stroke-amber" formatValue={(v) => v.toLocaleString()} />
            </div>
          )}
        </div>
      )}

      {!trendLoading && <WeightTrend entries={weightEntries} />}

      {!trendLoading && (moodTrend.length > 0 || spendingTrend.some((p) => p.value > 0)) && (
        <div className={`mb-6 flex flex-col gap-4 sm:flex-row ${card}`}>
          {moodTrend.length > 0 && (
            <div className="flex-1">
              <h2 className={`mb-2 ${sectionLabel}`}>Mood ({TREND_DAYS}d)</h2>
              <LineChart points={moodTrend} color="stroke-amber" formatValue={(v) => `${v}/5`} />
            </div>
          )}
          {spendingTrend.some((p) => p.value > 0) && (
            <div className="flex-1">
              <h2 className={`mb-2 ${sectionLabel}`}>Spending ({TREND_DAYS}d)</h2>
              <LineChart points={spendingTrend} color="stroke-bloom" formatValue={formatINR} />
            </div>
          )}
        </div>
      )}

      {!trendLoading &&
        (waterWeekly.some((p) => p.value > 0) ||
          exerciseWeekly.some((p) => p.value > 0) ||
          stepsWeekly.some((p) => p.value > 0)) && (
          <div className={`mb-6 ${card}`}>
            <p className={`mb-3 ${mutedText}`}>Weekly averages over the last {WEEKLY_WEEKS} weeks.</p>
            <div className="flex flex-col gap-4 sm:flex-row">
              {waterWeekly.some((p) => p.value > 0) && (
                <div className="flex-1">
                  <h2 className={`mb-2 ${sectionLabel}`}>Water (weekly avg)</h2>
                  <LineChart points={waterWeekly} formatValue={(v) => `${(v / 1000).toFixed(1)}L`} />
                </div>
              )}
              {exerciseWeekly.some((p) => p.value > 0) && (
                <div className="flex-1">
                  <h2 className={`mb-2 ${sectionLabel}`}>Exercise (weekly avg)</h2>
                  <LineChart points={exerciseWeekly} color="stroke-alert" formatValue={(v) => `${v.toFixed(0)}min`} />
                </div>
              )}
              {stepsWeekly.some((p) => p.value > 0) && (
                <div className="flex-1">
                  <h2 className={`mb-2 ${sectionLabel}`}>Steps (weekly avg)</h2>
                  <LineChart points={stepsWeekly} color="stroke-amber" formatValue={(v) => Math.round(v).toLocaleString()} />
                </div>
              )}
            </div>
          </div>
        )}

      {!trendLoading && (moodWeekly.some((p) => p.value > 0) || spendingWeekly.some((p) => p.value > 0)) && (
        <div className={`mb-6 ${card}`}>
          <p className={`mb-3 ${mutedText}`}>Weekly {moodWeekly.some((p) => p.value > 0) ? "average / " : ""}total over the last {WEEKLY_WEEKS} weeks.</p>
          <div className="flex flex-col gap-4 sm:flex-row">
            {moodWeekly.some((p) => p.value > 0) && (
              <div className="flex-1">
                <h2 className={`mb-2 ${sectionLabel}`}>Mood (weekly avg)</h2>
                <LineChart points={moodWeekly} color="stroke-amber" formatValue={(v) => `${v.toFixed(1)}/5`} />
              </div>
            )}
            {spendingWeekly.some((p) => p.value > 0) && (
              <div className="flex-1">
                <h2 className={`mb-2 ${sectionLabel}`}>Spending (weekly total)</h2>
                <LineChart points={spendingWeekly} color="stroke-bloom" formatValue={formatINR} />
              </div>
            )}
          </div>
        </div>
      )}

      {categoryBreakdown.length > 0 && (
        <div className={`mb-6 ${card}`}>
          <h2 className={`mb-3 ${sectionLabel}`}>Spending by category ({WEEKLY_WEEKS} weeks)</h2>
          <ul className="flex flex-col gap-2">
            {categoryBreakdown.map(({ category, total }) => (
              <li key={category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-ink dark:text-paper">
                    {EXPENSE_CATEGORY_EMOJI[category]} {EXPENSE_CATEGORY_LABEL[category]}
                  </span>
                  <span className="font-medium text-ink dark:text-paper">{formatINR(total)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone dark:bg-stone-dark">
                  <div
                    className={`h-full ${EXPENSE_CATEGORY_BAR[category]}`}
                    style={{ width: `${(total / categoryBreakdown[0].total) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {progressSummary &&
        (progressSummary.wishes.length > 0 || progressSummary.budgets.length > 0 || progressSummary.habits.length > 0) && (
          <div className={`mb-6 flex flex-col gap-4 ${card}`}>
            <h2 className={sectionLabel}>Your progress</h2>

            {progressSummary.wishes.length > 0 && (
              <div>
                <p className={`mb-1.5 text-xs font-medium uppercase tracking-wide ${mutedText}`}>Wishes</p>
                <ul className="flex flex-col gap-1">
                  {progressSummary.wishes.map((w) => (
                    <li key={w.title} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-ink dark:text-paper">{w.title}</span>
                      <span className={w.fallingBehind ? "shrink-0 font-medium text-alert" : `shrink-0 ${mutedText}`}>
                        {w.progressPercent ?? 0}% done{w.fallingBehind ? " · falling behind" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {progressSummary.habits.some((h) => h.currentStreakDays > 0 || h.missedInLast7Days > 0) && (
              <div>
                <p className={`mb-1.5 text-xs font-medium uppercase tracking-wide ${mutedText}`}>Habit streaks</p>
                <ul className="flex flex-col gap-1">
                  {progressSummary.habits.map((h) => (
                    <li key={h.habitType} className="flex items-center justify-between gap-2 text-sm">
                      <span className="capitalize text-ink dark:text-paper">{h.habitType}</span>
                      <span className={mutedText}>
                        {h.currentStreakDays > 0 ? `🔥 ${h.currentStreakDays}d streak` : "No current streak"} · missed{" "}
                        {h.missedInLast7Days}/7d
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {progressSummary.budgets.length > 0 && (
              <div>
                <p className={`mb-1.5 text-xs font-medium uppercase tracking-wide ${mutedText}`}>Budgets this month</p>
                <ul className="flex flex-col gap-1">
                  {progressSummary.budgets.map((b) => (
                    <li key={b.category} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-ink dark:text-paper">
                        {EXPENSE_CATEGORY_EMOJI[b.category]} {EXPENSE_CATEGORY_LABEL[b.category]}
                      </span>
                      <span className={b.projectedOverBy > 0 ? "font-medium text-alert" : mutedText}>
                        {formatINR(b.remainingThisMonth)} left
                        {b.projectedOverBy > 0 && ` · pace projects ${formatINR(b.projectedOverBy)} over`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

      <div className={`mb-6 flex flex-wrap items-center gap-3 ${card}`}>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setPeriod("day")}
            className={`${pillButton} px-3 py-1 ${period === "day" ? pillButtonDone : pillButtonInactive}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setPeriod("week")}
            className={`${pillButton} px-3 py-1 ${period === "week" ? pillButtonDone : pillButtonInactive}`}
          >
            This week
          </button>
        </div>
        <button type="button" disabled={loading} onClick={handleGenerate} className={primaryButton}>
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {error && <p className={`mb-4 ${errorText}`}>{error}</p>}

      {insights && (
        <div className="flex flex-col gap-6">
          <div className={card}>
            <h2 className={`mb-2 ${sectionLabel}`}>Summary</h2>
            <p className="text-sm text-ink dark:text-paper">{insights.summary}</p>
          </div>

          {insights.highlights.length > 0 && (
            <div className={card}>
              <h2 className={`mb-2 ${sectionLabel}`}>Highlights</h2>
              <ul className="flex flex-col gap-1.5">
                {insights.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-ink dark:text-paper">
                    • {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insights.suggestions.length > 0 && (
            <div className={card}>
              <h2 className={`mb-2 ${sectionLabel}`}>Suggestions</h2>
              <ul className="flex flex-col gap-1.5">
                {insights.suggestions.map((s, i) => (
                  <li key={i} className="text-sm text-bloom">
                    • {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
