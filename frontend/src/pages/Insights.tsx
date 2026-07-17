import { useState } from "react";
import { useApi } from "../api/useApi";
import type { Insights as InsightsData } from "../types";
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

export default function Insights() {
  const { request } = useApi();
  const [period, setPeriod] = useState<Period>("day");
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
