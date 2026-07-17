import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import TodayHabits from "../components/TodayHabits";
import TodaySchedule from "../components/TodaySchedule";
import PwaSettings from "../components/PwaSettings";
import { card, errorText, mutedText, page, pageTitle, sectionLabel } from "../components/ui";

interface WhoAmIResponse {
  message: string;
  userId: string | null;
  email: string | null;
  timestamp: string;
}

export default function Dashboard() {
  const { getIdToken } = useAuth();
  const [whoami, setWhoami] = useState<WhoAmIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function callWhoAmI() {
      try {
        const token = await getIdToken();
        const res = await fetch(`${import.meta.env.VITE_API_URL}/whoami`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        setWhoami(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      }
    }
    callWhoAmI();
  }, [getIdToken]);

  return (
    <div className={page}>
      <h1 className={pageTitle}>Dashboard</h1>

      <div className="mb-6">
        <TodaySchedule />
      </div>

      <div className="mb-6">
        <TodayHabits />
      </div>

      <div className="mb-6">
        <PwaSettings />
      </div>

      <div className={card}>
        <h2 className={`mb-2 ${sectionLabel}`}>Backend authorizer check (GET /whoami)</h2>
        {error && <p className={errorText}>{error}</p>}
        {!error && !whoami && <p className={mutedText}>Loading...</p>}
        {whoami && (
          <pre className="overflow-x-auto text-xs text-ink-muted dark:text-fog-muted">
            {JSON.stringify(whoami, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
