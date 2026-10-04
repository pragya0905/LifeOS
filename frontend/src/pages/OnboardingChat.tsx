import { useNavigate } from "react-router-dom";
import { useApi } from "../api/useApi";
import Assistant from "./Assistant";

// The second, skippable half of onboarding — the quick form (Onboarding.tsx) handles the fast
// numeric fields, this hands off to the real Assistant chat (not a second bespoke UI) so
// whatever the user describes benefits from the same tool-calling this app already has.
export default function OnboardingChat() {
  const { request } = useApi();
  const navigate = useNavigate();

  async function handleFinish() {
    try {
      await request("/profile", { method: "PATCH", body: JSON.stringify({ onboardingCompleted: true }) });
    } catch {
      // Best-effort — don't trap the user here if this one write fails; they can still reach
      // the dashboard, and OnboardingGate will just ask again next time if it didn't stick.
    }
    navigate("/dashboard", { replace: true });
  }

  return <Assistant onboarding onFinish={handleFinish} />;
}
