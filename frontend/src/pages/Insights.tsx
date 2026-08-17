import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import LineChart from "../components/LineChart";
import type { HabitLog, Insights as InsightsData } from "../types";
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

function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
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
  const [meditationTrend, setMeditationTrend] = useState<{ date: string; value: number }[]>([]);

  useEffect(() => {
    let ignore = false;
    async function loadTrend() {
      setTrendLoading(true);
      try {
        const from = dateOffset(TREND_DAYS - 1);
        const to = dateOffset(0);
        const data = await request<{ habits: HabitLog[] }>(`/habits?from=${from}&to=${to}`);
        if (ignore) return;
        const byType = (type: HabitLog["habitType"]) =>
          data.habits
            .filter((h) => h.habitType === type)
            .map((h) => ({ date: h.date, value: h.value ?? 0 }))
            .sort((a, b) => (a.date < b.date ? -1 : 1));
        setWaterTrend(byType("water"));
        setExerciseTrend(byType("exercise"));
        setMeditationTrend(byType("meditation"));
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
        Generate an AI summary of your recent activity, on demand — nothing runs automatically.
      </p>

      {!trendLoading && (waterTrend.length > 0 || exerciseTrend.length > 0 || meditationTrend.length > 0) && (
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
              <LineChart points={exerciseTrend} color="stroke-terracotta" formatValue={(v) => `${v}min`} />
            </div>
          )}
          {meditationTrend.length > 0 && (
            <div className="flex-1">
              <h2 className={`mb-2 ${sectionLabel}`}>Meditation ({TREND_DAYS}d)</h2>
              <LineChart points={meditationTrend} color="stroke-[#C79233]" formatValue={(v) => `${v}min`} />
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
            <p className="text-sm text-ink dark:text-cream">{insights.summary}</p>
          </div>

          {insights.highlights.length > 0 && (
            <div className={card}>
              <h2 className={`mb-2 ${sectionLabel}`}>Highlights</h2>
              <ul className="flex flex-col gap-1.5">
                {insights.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-ink dark:text-cream">
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
                  <li key={i} className="text-sm text-sage">
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
