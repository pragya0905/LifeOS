// The Today page's secondary modules (everything below the core hero/chips/timeline/
// next-up block) are user-hideable and reorderable, persisted locally per device.
export type TodayModuleId =
  | "habits"
  | "cycle"
  | "budget"
  | "meals"
  | "expenses"
  | "insightsRecap"
  | "journalPrompt"
  | "achievements";

export interface TodayModuleConfig {
  id: TodayModuleId;
  visible: boolean;
}

export const MODULE_LABELS: Record<TodayModuleId, string> = {
  habits: "Habits detail",
  cycle: "Cycle glance",
  budget: "Budget glance",
  meals: "Meals",
  expenses: "Expenses",
  insightsRecap: "Weekly insight recap",
  journalPrompt: "Journal prompt",
  achievements: "Achievements",
};

export const DEFAULT_MODULE_ORDER: TodayModuleId[] = [
  "habits",
  "cycle",
  "budget",
  "meals",
  "expenses",
  "insightsRecap",
  "journalPrompt",
  "achievements",
];

export function defaultModuleConfig(): TodayModuleConfig[] {
  return DEFAULT_MODULE_ORDER.map((id) => ({ id, visible: true }));
}

const STORAGE_KEY = "lifeos_today_modules_v1";

export function loadModuleConfig(): TodayModuleConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultModuleConfig();
    const parsed = JSON.parse(raw) as TodayModuleConfig[];
    const known = new Set(DEFAULT_MODULE_ORDER);
    const kept = parsed.filter((m) => known.has(m.id));
    // Any module id added after a user's saved config predates it (a future release) is
    // appended visible-by-default, same "sensible default" rule the rest of this config uses.
    const missing = DEFAULT_MODULE_ORDER.filter((id) => !kept.some((m) => m.id === id));
    return [...kept, ...missing.map((id) => ({ id, visible: true }))];
  } catch {
    return defaultModuleConfig();
  }
}

export function saveModuleConfig(config: TodayModuleConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // best-effort — just won't persist across reloads.
  }
}
