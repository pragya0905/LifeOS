import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

interface WhoAmIResponse {
  message: string;
  userId: string | null;
  email: string | null;
  timestamp: string;
}

export default function Dashboard() {
  const { user, signOut, getIdToken } = useAuth();
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
    <div className="mx-auto mt-16 w-full max-w-lg px-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Dashboard
        </h1>
        <button
          onClick={() => signOut()}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Log out
        </button>
      </div>
      <p className="mb-4 text-gray-700 dark:text-gray-300">
        Logged in as <strong>{user?.email}</strong>
      </p>

      <div className="rounded-md border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
          Backend authorizer check (GET /whoami)
        </h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !whoami && <p className="text-sm text-gray-500">Loading...</p>}
        {whoami && (
          <pre className="overflow-x-auto text-xs text-gray-800 dark:text-gray-200">
            {JSON.stringify(whoami, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
