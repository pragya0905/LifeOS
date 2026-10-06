import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { AssistantModel, UserProfile } from "../types";
import { Skeleton } from "./Skeleton";
import { card, errorText, mutedText, pillButton, pillButtonDone, pillButtonInactive, sectionLabel } from "./ui";

const DEFAULT_MODEL: AssistantModel = "claude-haiku-4-5";

const MODEL_OPTIONS: { value: AssistantModel; label: string; hint: string }[] = [
  { value: "claude-haiku-4-5", label: "Haiku", hint: "Fastest, lowest cost — good default" },
  { value: "claude-sonnet-5", label: "Sonnet", hint: "~2x the cost of Haiku, stronger reasoning" },
  { value: "claude-opus-5", label: "Opus", hint: "~5x the cost of Haiku, most capable" },
];

export default function AssistantModelPicker() {
  const { request } = useApi();
  const [model, setModel] = useState<AssistantModel | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    request<UserProfile>("/profile")
      .then((profile) => {
        if (!ignore) setModel(profile.assistantModel ?? DEFAULT_MODEL);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load model preference");
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelect(next: AssistantModel) {
    const previous = model;
    setModel(next);
    setSaving(true);
    setError(null);
    try {
      await request("/profile", { method: "PATCH", body: JSON.stringify({ assistantModel: next }) });
    } catch (err) {
      setModel(previous);
      setError(err instanceof Error ? err.message : "Failed to save model preference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={card}>
      <h2 className={`mb-1 ${sectionLabel}`}>Assistant model</h2>
      <p className={`mb-3 ${mutedText}`}>Which Claude model powers chat and voice mode.</p>
      {error && <p className={`mb-2 ${errorText}`}>{error}</p>}
      {model === null ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="flex flex-col gap-2">
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              onClick={() => handleSelect(opt.value)}
              className={`${pillButton} flex-col items-start gap-0.5 px-3 py-2 text-left ${
                model === opt.value ? pillButtonDone : pillButtonInactive
              }`}
            >
              <span className="text-sm font-medium">{opt.label}</span>
              <span className={`text-xs ${model === opt.value ? "" : mutedText}`}>{opt.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
