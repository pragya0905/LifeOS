import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { AssistantTone, Goal, UserProfile, UserSex } from "../types";
import {
  card,
  errorText,
  input,
  label,
  mutedText,
  pillButton,
  pillButtonDone,
  pillButtonInactive,
  primaryButton,
  sectionLabel,
} from "./ui";

const SEX_OPTIONS: { value: UserSex; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unspecified", label: "Prefer not to say" },
];

const TONE_OPTIONS: { value: AssistantTone; label: string; hint: string }[] = [
  { value: "warm", label: "Warm", hint: "Supportive and gentle (default)" },
  { value: "direct", label: "Direct", hint: "Brief, straight to the point" },
  { value: "playful", label: "Playful", hint: "Lighter, more humor" },
];

export default function Profile() {
  const { request } = useApi();
  const [loading, setLoading] = useState(true);
  const [heightDraft, setHeightDraft] = useState("");
  const [weightTargetDraft, setWeightTargetDraft] = useState("");
  const [sex, setSex] = useState<UserSex | null>(null);
  const [preferredNameDraft, setPreferredNameDraft] = useState("");
  const [tone, setTone] = useState<AssistantTone>("warm");
  const [locationDraft, setLocationDraft] = useState("");
  const [savingHeight, setSavingHeight] = useState(false);
  const [savingWeightTarget, setSavingWeightTarget] = useState(false);
  const [savingSex, setSavingSex] = useState(false);
  const [savingPreferredName, setSavingPreferredName] = useState(false);
  const [savingTone, setSavingTone] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [savedHeight, setSavedHeight] = useState(false);
  const [savedWeightTarget, setSavedWeightTarget] = useState(false);
  const [savedPreferredName, setSavedPreferredName] = useState(false);
  const [savedLocation, setSavedLocation] = useState(false);
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
        if (profile.sex) setSex(profile.sex);
        if (profile.preferredName) setPreferredNameDraft(profile.preferredName);
        if (profile.assistantTone) setTone(profile.assistantTone);
        if (profile.location) setLocationDraft(profile.location);
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

  async function handleSetSex(next: UserSex) {
    const previous = sex;
    setSex(next);
    setSavingSex(true);
    setError(null);
    try {
      await request("/profile", { method: "PATCH", body: JSON.stringify({ sex: next }) });
    } catch (err) {
      setSex(previous);
      setError(err instanceof Error ? err.message : "Failed to save sex");
    } finally {
      setSavingSex(false);
    }
  }

  async function handleSavePreferredName() {
    const preferredName = preferredNameDraft.trim();
    if (!preferredName) {
      setError("Enter a name");
      return;
    }
    setSavingPreferredName(true);
    setError(null);
    try {
      await request("/profile", { method: "PATCH", body: JSON.stringify({ preferredName }) });
      setSavedPreferredName(true);
      setTimeout(() => setSavedPreferredName(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save name");
    } finally {
      setSavingPreferredName(false);
    }
  }

  async function handleSetTone(next: AssistantTone) {
    const previous = tone;
    setTone(next);
    setSavingTone(true);
    setError(null);
    try {
      await request("/profile", { method: "PATCH", body: JSON.stringify({ assistantTone: next }) });
    } catch (err) {
      setTone(previous);
      setError(err instanceof Error ? err.message : "Failed to save tone");
    } finally {
      setSavingTone(false);
    }
  }

  async function handleSaveLocation() {
    const location = locationDraft.trim();
    if (!location) {
      setError("Enter a location");
      return;
    }
    setSavingLocation(true);
    setError(null);
    try {
      await request("/profile", { method: "PATCH", body: JSON.stringify({ location }) });
      setSavedLocation(true);
      setTimeout(() => setSavedLocation(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setSavingLocation(false);
    }
  }

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
            <label className={label}>What should the Assistant call you?</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={40}
                value={preferredNameDraft}
                onChange={(e) => setPreferredNameDraft(e.target.value)}
                placeholder="e.g. Pragya"
                className={`w-40 ${input}`}
              />
              <button
                type="button"
                onClick={handleSavePreferredName}
                disabled={savingPreferredName}
                className={`${primaryButton} px-3 py-1.5 text-xs`}
              >
                {savingPreferredName ? "Saving..." : "Save"}
              </button>
              {savedPreferredName && <span className="text-sm text-bloom">Saved ✓</span>}
            </div>
            <p className={`mt-1 ${mutedText}`}>Used by the Assistant in chat and voice mode instead of nothing at all.</p>
          </div>

          <div>
            <label className={label}>Assistant tone</label>
            <div className="flex flex-wrap gap-1.5">
              {TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingTone}
                  onClick={() => handleSetTone(opt.value)}
                  className={`${pillButton} flex-col items-start gap-0.5 px-3 py-1.5 text-left ${
                    tone === opt.value ? pillButtonDone : pillButtonInactive
                  }`}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className={`text-xs ${tone === opt.value ? "" : mutedText}`}>{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={label}>Location</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={100}
                value={locationDraft}
                onChange={(e) => setLocationDraft(e.target.value)}
                placeholder="e.g. Bengaluru, India"
                className={`w-48 ${input}`}
              />
              <button
                type="button"
                onClick={handleSaveLocation}
                disabled={savingLocation}
                className={`${primaryButton} px-3 py-1.5 text-xs`}
              >
                {savingLocation ? "Saving..." : "Save"}
              </button>
              {savedLocation && <span className="text-sm text-bloom">Saved ✓</span>}
            </div>
            <p className={`mt-1 ${mutedText}`}>
              Used to make Insights, Meal Plan suggestions, and the Assistant's weather tool location-aware.
            </p>
          </div>

          <div>
            <label className={label}>Sex</label>
            <div className="flex flex-wrap gap-1.5">
              {SEX_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingSex}
                  onClick={() => handleSetSex(opt.value)}
                  className={`${pillButton} px-3 py-1 ${sex === opt.value ? pillButtonDone : pillButtonInactive}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className={`mt-1 ${mutedText}`}>
              Used only to show/hide the Cycle feature and a relevant healthy body-fat % range
              on Insights.
            </p>
          </div>

          <div>
            <label className={label}>Height (cm)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                step="0.1"
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
                step="0.1"
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
