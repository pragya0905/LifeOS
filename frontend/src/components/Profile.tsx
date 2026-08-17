import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { UserProfile } from "../types";
import { card, errorText, input, label, mutedText, primaryButton, sectionLabel } from "./ui";

export default function Profile() {
  const { request } = useApi();
  const [loading, setLoading] = useState(true);
  const [heightDraft, setHeightDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const profile = await request<UserProfile>("/profile");
        if (!ignore && profile.heightCm) setHeightDraft(String(profile.heightCm));
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

  async function handleSave() {
    const heightCm = Number(heightDraft);
    if (!heightDraft.trim() || !Number.isFinite(heightCm) || heightCm <= 0) {
      setError("Enter a positive height in cm");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await request("/profile", { method: "PATCH", body: JSON.stringify({ heightCm }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={card}>
      <h2 className={`mb-3 ${sectionLabel}`}>Profile</h2>
      {loading ? (
        <p className={mutedText}>Loading...</p>
      ) : (
        <div className="flex flex-col gap-2">
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
                onClick={handleSave}
                disabled={saving}
                className={`${primaryButton} px-3 py-1.5 text-xs`}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {saved && <span className="text-sm text-sage">Saved ✓</span>}
            </div>
          </div>
          {error && <p className={errorText}>{error}</p>}
          <p className={mutedText}>Used to calculate BMI alongside your logged weight.</p>
        </div>
      )}
    </div>
  );
}
