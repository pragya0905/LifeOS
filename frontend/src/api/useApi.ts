import { useAuth } from "../auth/AuthContext";

const API_URL = import.meta.env.VITE_API_URL;

export function useApi() {
  const { getIdToken } = useAuth();

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await getIdToken();
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  return { request };
}
