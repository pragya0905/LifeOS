import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

interface ToastContextValue {
  show: (message: string, options?: { undo?: () => void; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

// A single global toast slot — later phases' optimistic deletes/undos (Phase 2+) call
// `useToast().show(message, { undo })` from anywhere once <ToastProvider> wraps the app.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options?: { undo?: () => void; durationMs?: number }) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, undo: options?.undo }]);
      window.setTimeout(() => dismiss(id), options?.durationMs ?? DEFAULT_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-fade-in-up pointer-events-auto flex items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-sm text-paper shadow-raised dark:bg-paper-card dark:text-ink dark:shadow-raised-dark"
          >
            <span>{t.message}</span>
            {t.undo && (
              <button
                type="button"
                onClick={() => {
                  t.undo?.();
                  dismiss(t.id);
                }}
                className="font-medium text-bloom-light underline dark:text-bloom"
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
