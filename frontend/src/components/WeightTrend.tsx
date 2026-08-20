import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { LogEntry, UserProfile } from "../types";
import LineChart from "./LineChart";
import { card, mutedText, sectionLabel } from "./ui";

export default function WeightTrend({ entries }: { entries: LogEntry[] }) {
  const { request } = useApi();
  const [heightCm, setHeightCm] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    request<UserProfile>("/profile")
      .then((profile) => {
        if (!ignore) setHeightCm(profile.heightCm ?? null);
      })
      .catch(() => {
        // BMI just won't show if this fails — not critical to the page.
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weightPoints = entries
    .filter((e) => e.logType === "weight")
    .map((e) => ({ date: e.date, value: e.data.valueKg as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const bodyFatPoints = entries
    .filter((e) => e.logType === "bodyFat")
    .map((e) => ({ date: e.date, value: e.data.percentage as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (weightPoints.length === 0 && bodyFatPoints.length === 0) return null;

  const latestWeight = weightPoints[weightPoints.length - 1]?.value;
  const bmi =
    heightCm && latestWeight ? latestWeight / (heightCm / 100) ** 2 : null;

  return (
    <div className={`mb-6 flex flex-col gap-4 sm:flex-row ${card}`}>
      {weightPoints.length > 0 && (
        <div className="flex-1">
          <h2 className={`mb-2 ${sectionLabel}`}>Weight</h2>
          <LineChart points={weightPoints} formatValue={(v) => `${v}kg`} />
          {bmi !== null && (
            <p className={`mt-1 ${mutedText}`}>BMI: {bmi.toFixed(1)}</p>
          )}
          {bmi === null && (
            <p className={`mt-1 ${mutedText}`}>Set your height in Settings to see BMI.</p>
          )}
        </div>
      )}
      {bodyFatPoints.length > 0 && (
        <div className="flex-1">
          <h2 className={`mb-2 ${sectionLabel}`}>Body fat %</h2>
          <LineChart points={bodyFatPoints} color="stroke-alert" formatValue={(v) => `${v}%`} />
        </div>
      )}
    </div>
  );
}
