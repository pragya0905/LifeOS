import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api/useApi";
import type { UserSex } from "../types";
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
  secondaryButton,
} from "../components/ui";

const SEX_OPTIONS: { value: UserSex; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unspecified", label: "Prefer not to say" },
];

interface FieldConfig {
  key: "heightCm" | "weightTarget" | "water" | "exercise" | "steps";
  label: string;
  placeholder: string;
  hint: string;
  step?: string;
}

const FIELDS: FieldConfig[] = [
  { key: "heightCm", label: "Height (cm)", placeholder: "e.g. 170", hint: "Used to calculate BMI.", step: "0.1" },
  { key: "weightTarget", label: "Weight target (kg)", placeholder: "e.g. 65", hint: "Shown on your weight trend chart.", step: "0.1" },
  { key: "water", label: "Water target (ml/day)", placeholder: "e.g. 2500", hint: "Tracked on your daily water ring." },
  { key: "exercise", label: "Exercise target (min/day)", placeholder: "e.g. 30", hint: "Tracked on your daily exercise ring." },
  { key: "steps", label: "Steps target (steps/day)", placeholder: "e.g. 8000", hint: "Tracked on your daily steps ring." },
];

const GOAL_METRIC: Partial<Record<FieldConfig["key"], "water" | "exercise" | "steps" | "weight">> = {
  weightTarget: "weight",
  water: "water",
  exercise: "exercise",
  steps: "steps",
};

export default function Onboarding() {
  const { request } = useApi();
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, string>>({});
  const [sex, setSex] = useState<UserSex | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(markComplete: boolean) {
    setSaving(true);
    setError(null);
    try {
      const tasks: Promise<unknown>[] = [];

      const heightCm = values.heightCm ? Number(values.heightCm) : undefined;
      const profileBody: Record<string, unknown> = {};
      if (heightCm && Number.isFinite(heightCm) && heightCm > 0) profileBody.heightCm = heightCm;
      if (sex) profileBody.sex = sex;
      if (markComplete) profileBody.onboardingCompleted = true;
      if (Object.keys(profileBody).length > 0) {
        tasks.push(request("/profile", { method: "PATCH", body: JSON.stringify(profileBody) }));
      }

      for (const field of FIELDS) {
        const metric = GOAL_METRIC[field.key];
        if (!metric) continue;
        const raw = values[field.key];
        if (!raw) continue;
        const targetValue = Number(raw);
        if (!Number.isFinite(targetValue) || targetValue <= 0) continue;
        tasks.push(
          request(`/goals/${metric}`, { method: "PATCH", body: JSON.stringify({ targetValue }) }),
        );
      }

      await Promise.all(tasks);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setup");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    finish(true);
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-lg px-4 pb-16">
      <h1 className="font-display mb-2 text-3xl font-medium text-ink dark:text-paper">
        🌸 Welcome to LifeOs
      </h1>
      <p className={`mb-6 ${mutedText}`}>
        LifeOs tracks habits, tasks, journal entries, and more in one place. Write freely in{" "}
        <span className="text-bloom">Journal</span> and AI fills in matching fields for you, or
        edit values directly on the Dashboard. Set a few targets below to get your progress rings
        and trend charts started — every field is optional, and you can change these any time in
        Settings.
      </p>

      <form onSubmit={handleSubmit} className={`mb-4 flex flex-col gap-4 ${card}`}>
        <div>
          <label className={label}>Sex</label>
          <div className="flex flex-wrap gap-1.5">
            {SEX_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSex(opt.value)}
                className={`${pillButton} px-3 py-1 ${sex === opt.value ? pillButtonDone : pillButtonInactive}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className={`mt-1 ${mutedText}`}>
            Used only to show/hide the Cycle feature and to show a relevant healthy body-fat %
            range on Insights. Optional — you can change this any time in Settings.
          </p>
        </div>

        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className={label}>{field.label}</label>
            <input
              type="number"
              min={1}
              step={field.step}
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className={`w-full ${input}`}
            />
            <p className={`mt-1 ${mutedText}`}>{field.hint}</p>
          </div>
        ))}

        {error && <p className={errorText}>{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? "Saving..." : "Get started"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => finish(true)}
            className={secondaryButton}
          >
            Skip for now
          </button>
        </div>
      </form>
    </div>
  );
}
