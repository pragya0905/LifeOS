import { useEffect, useState } from "react";

// Keeps the screen on while `active`. The browser drops the lock whenever the page is hidden, so
// it is taken again when the page comes back. Returns whether a lock is held right now.
// Unsupported browsers and refusals (low battery) just mean no lock: it is a nicety, never required.
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    async function acquire() {
      if (cancelled || sentinel || document.hidden) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        setHeld(true);
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
          if (!cancelled) setHeld(false);
        });
      } catch {
        setHeld(false);
      }
    }

    function onVisibility() {
      if (!document.hidden) void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const lock = sentinel;
      sentinel = null;
      if (lock) void lock.release().catch(() => {});
      setHeld(false);
    };
  }, [active]);

  return held;
}
