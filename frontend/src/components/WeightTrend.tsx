import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { Goal, LogEntry, UserProfile, UserSex } from "../types";
import LineChart from "./LineChart";
import { card, mutedText, sectionLabel } from "./ui";

// General reference ranges (American Council on Exercise categories, combining "athletes"
// through "acceptable") — a wide, commonly-cited band, not a medical diagnosis. Only shown
// when sex is known (male/female), since the range genuinely differs by sex.
const BODY_FAT_HEALTHY_RANGE: Record<"male" | "female", [number, number]> = {
  male: [6, 24],
  female: [14, 31],
};

export default function WeightTrend({ entries }: { entries: LogEntry[] }) {
  const { request } = useApi();
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [sex, setSex] = useState<UserSex | null>(null);
  const [weightTarget, setWeightTarget] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    request<UserProfile>("/profile")
      .then((profile) => {
        if (ignore) return;
        setHeightCm(profile.heightCm ?? null);
        setSex(profile.sex ?? null);
      })
      .catch(() => {
        // BMI/body-fat range just won't show if this fails — not critical to the page.
      });
    request<{ goals: Goal[] }>("/goals")
      .then((data) => {
        if (ignore) return;
        const goal = data.goals.find((g) => g.metric === "weight");
        if (goal) setWeightTarget(goal.targetValue);
      })
      .catch(() => {
        // The target line just won't show if this fails — not critical to the page.
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

  const healthyRange = sex === "male" || sex === "female" ? BODY_FAT_HEALTHY_RANGE[sex] : null;
  const latestBodyFat = bodyFatPoints[bodyFatPoints.length - 1]?.value;
  const withinRange =
    healthyRange && latestBodyFat !== undefined
      ? latestBodyFat >= healthyRange[0] && latestBodyFat <= healthyRange[1]
      : null;

  return (
    <div className={`mb-6 flex flex-col gap-4 sm:flex-row ${card}`}>
      {weightPoints.length > 0 && (
        <div className="flex-1">
          <h2 className={`mb-2 ${sectionLabel}`}>Weight</h2>
          <LineChart
            points={weightPoints}
            formatValue={(v) => `${v}kg`}
            targetValue={weightTarget ?? undefined}
            targetLabel="Target"
          />
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
          {healthyRange ? (
            <p className={`mt-1 ${mutedText}`}>
              Healthy range for you: {healthyRange[0]}–{healthyRange[1]}%
              {withinRange !== null && (
                <span
                  className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                    withinRange
                      ? "bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light"
                      : "bg-amber-soft text-amber-ink dark:bg-amber-soft-dark dark:text-amber-ink-dark"
                  }`}
                >
                  {withinRange ? "within range" : "outside typical range"}
                </span>
              )}
            </p>
          ) : (
            <p className={`mt-1 ${mutedText}`}>Set your sex in Settings to see a healthy range.</p>
          )}
        </div>
      )}
    </div>
  );
}
