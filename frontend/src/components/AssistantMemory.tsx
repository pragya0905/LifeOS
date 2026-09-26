import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import type { UserMemory } from "../types";
import { Skeleton } from "./Skeleton";
import { badge, card, errorText, mutedText, sectionLabel } from "./ui";

export default function AssistantMemory() {
  const { request } = useApi();
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    request<{ memories: UserMemory[] }>("/memory")
      .then((data) => {
        if (!ignore) setMemories(data.memories);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load memory");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(memoryId: string) {
    setDeletingId(memoryId);
    setError(null);
    try {
      await request(`/memory/${memoryId}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.memoryId !== memoryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={card}>
      <h2 className={`mb-2 ${sectionLabel}`}>What the Assistant remembers</h2>
      <p className={`mb-3 ${mutedText}`}>
        Facts the Assistant has picked up from conversations and carries into future ones. Delete
        anything that's wrong or no longer relevant.
      </p>
      {error && <p className={`mb-2 ${errorText}`}>{error}</p>}
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ) : memories.length === 0 ? (
        <p className={mutedText}>Nothing remembered yet — it builds up as you chat with the Assistant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {memories.map((m) => (
            <li
              key={m.memoryId}
              className="flex items-start justify-between gap-3 rounded-xl border border-stone px-3 py-2 dark:border-stone-dark"
            >
              <div>
                <span className={badge}>{m.category}</span>
                <p className="mt-1 text-sm text-ink dark:text-paper">{m.text}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(m.memoryId)}
                disabled={deletingId === m.memoryId}
                className="shrink-0 text-xs text-alert hover:underline disabled:opacity-50"
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
