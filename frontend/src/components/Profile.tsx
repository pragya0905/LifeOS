import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { Goal, UserProfile } from "../types";
import { card, errorText, input, label, mutedText, primaryButton, sectionLabel } from "./ui";

export default function Profile() {
  const { request } = useApi();
  const [loading, setLoading] = useState(true);
  const [heightDraft, setHeightDraft] = useState("");
  const [weightTargetDraft, setWeightTargetDraft] = useState("");
  const [savingHeight, setSavingHeight] = useState(false);
  const [savingWeightTarget, setSavingWeightTarget] = useState(false);
  const [savedHeight, setSavedHeight] = useState(false);
  const [savedWeightTarget, setSavedWeightTarget] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const [profile, goalsData] = await Promise.all([
          request<UserProfile>("/profile"),
          request<{ goals: Goal[] }>("/goals"),
        ]);
        if (ignore) return;
        if (profile.heightCm) setHeightDraft(String(profile.heightCm));
        const weightGoal = goalsData.goals.find((g) => g.metric === "weight");
        if (weightGoal) setWeightTargetDraft(String(weightGoal.targetValue));
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveHeight() {
    const heightCm = Number(heightDraft);
    if (!heightDraft.trim() || !Number.isFinite(heightCm) || heightCm <= 0) {
      setError("Enter a positive height in cm");
      return;
    }
    setSavingHeight(true);
    setError(null);
    try {
      await request("/profile", { method: "PATCH", body: JSON.stringify({ heightCm }) });
      setSavedHeight(true);
      setTimeout(() => setSavedHeight(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSavingHeight(false);
    }
  }

  async function handleSaveWeightTarget() {
    const targetValue = Number(weightTargetDraft);
    if (!weightTargetDraft.trim() || !Number.isFinite(targetValue) || targetValue <= 0) {
      setError("Enter a positive weight target in kg");
      return;
    }
    setSavingWeightTarget(true);
    setError(null);
    try {
      await request("/goals/weight", { method: "PATCH", body: JSON.stringify({ targetValue }) });
      setSavedWeightTarget(true);
      setTimeout(() => setSavedWeightTarget(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save weight target");
    } finally {
      setSavingWeightTarget(false);
    }
  }

  return (
    <div className={card}>
      <h2 className={`mb-3 ${sectionLabel}`}>Profile</h2>
      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <label className={label}>Height (cm)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={heightDraft}
                onChange={(e) => setHeightDraft(e.target.value)}
                placeholder="e.g. 170"
                className={`w-24 ${input}`}
              />
              <button
                type="button"
                onClick={handleSaveHeight}
                disabled={savingHeight}
                className={`${primaryButton} px-3 py-1.5 text-xs`}
              >
                {savingHeight ? "Saving..." : "Save"}
              </button>
              {savedHeight && <span className="text-sm text-bloom">Saved ✓</span>}
            </div>
            <p className={`mt-1 ${mutedText}`}>Used to calculate BMI alongside your logged weight.</p>
          </div>

          <div>
            <label className={label}>Weight target (kg)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={weightTargetDraft}
                onChange={(e) => setWeightTargetDraft(e.target.value)}
                placeholder="e.g. 65"
                className={`w-24 ${input}`}
              />
              <button
                type="button"
                onClick={handleSaveWeightTarget}
                disabled={savingWeightTarget}
                className={`${primaryButton} px-3 py-1.5 text-xs`}
              >
                {savingWeightTarget ? "Saving..." : "Save"}
              </button>
              {savedWeightTarget && <span className="text-sm text-bloom">Saved ✓</span>}
            </div>
            <p className={`mt-1 ${mutedText}`}>Shown alongside your weight trend on Insights.</p>
          </div>

          {error && <p className={errorText}>{error}</p>}
        </div>
      )}
    </div>
  );
}
