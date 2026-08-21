import { useAuth } from "../auth/AuthContext";

const API_URL = import.meta.env.VITE_API_URL;

// A 503 from this API is exclusively AWS Lambda throttling the invocation before it ever
// runs (confirmed against CloudWatch: Lambda Throttles and API Gateway 5xx counts match
// exactly) — so it's always safe to retry, for every method, since nothing executed
// server-side. Other 5xx codes mean the Lambda did run and aren't retried here.
const RETRY_DELAYS_MS = [300, 900];

// Shared across every useApi() instance (module scope, not hook scope) so that the several
// components that independently fetch the same GET on mount (e.g. /profile from Layout,
// OnboardingGate, BudgetPreview, CyclePreview) collapse into a single network request.
// Only GET is deduped/cached — mutating methods always hit the network.
const GET_CACHE_TTL_MS = 4000;
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const recentGetResponses = new Map<string, { data: unknown; timestamp: number }>();

export function useApi() {
  const { getIdToken } = useAuth();

  async function doFetch<T>(path: string, options: RequestInit, method: string): Promise<T> {
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
      const data = res.status === 204 ? undefined : await res.json();
      if (method === "GET") {
        recentGetResponses.set(path, { data, timestamp: Date.now() });
      } else {
        // A write can make any previously-cached GET stale (e.g. OnboardingGate and
        // Onboarding both read GET /profile from separate mounts — without this, a GET
        // shortly after a PATCH to the same resource could still return the pre-write
        // cached response). Simplest correct fix: any successful write clears the whole
        // short-lived cache rather than trying to compute which paths it could affect.
        recentGetResponses.clear();
      }
      return data as T;
    }
    throw new Error("503 Service Unavailable: exhausted retries");
  }

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const method = (options.method ?? "GET").toUpperCase();
    if (method !== "GET") return doFetch<T>(path, options, method);

    const cached = recentGetResponses.get(path);
    if (cached && Date.now() - cached.timestamp < GET_CACHE_TTL_MS) {
      return cached.data as T;
    }

    const inFlight = inFlightGetRequests.get(path);
    if (inFlight) return inFlight as Promise<T>;

    const promise = doFetch<T>(path, options, method).finally(() => {
      inFlightGetRequests.delete(path);
    });
    inFlightGetRequests.set(path, promise);
    return promise;
  }

  return { request };
}
