import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useApi } from "../api/useApi";
import type { UserProfile } from "../types";

// Redirects a first-time user (no onboardingCompletedAt on their profile) to /onboarding,
// once, on their way into any protected page. There's no separate "first login" signal in
// this app — the profile flag itself is that signal, checked once per mount here rather than
// on every navigation to avoid an extra request per route change.
export default function OnboardingGate({ children }: { children: ReactNode }) {
  const { request } = useApi();
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let ignore = false;
    request<UserProfile>("/profile")
      .then((profile) => {
        if (!ignore) setNeedsOnboarding(!profile.onboardingCompletedAt);
      })
      .catch(() => {
        // If the check fails, don't block the app on it — just let the user in.
      })
      .finally(() => {
        if (!ignore) setChecked(true);
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked) return null;
  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
