import { useAuth } from "../auth/AuthContext";

const API_URL = import.meta.env.VITE_API_URL;

// A 503 from this API is exclusively AWS Lambda throttling the invocation before it ever
// runs (confirmed against CloudWatch: Lambda Throttles and API Gateway 5xx counts match
// exactly) — so it's always safe to retry, for every method, since nothing executed
// server-side. Other 5xx codes mean the Lambda did run and aren't retried here.
const RETRY_DELAYS_MS = [300, 900];

export function useApi() {
  const { getIdToken } = useAuth();

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await getIdToken();
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const res = await fetch(`${API_URL}${path}`, { ...options, headers });

      if (res.status === 503 && attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
      }
      if (res.status === 204) return undefined as T;
      return res.json();
    }
    throw new Error("503 Service Unavailable: exhausted retries");
  }

  return { request };
}
