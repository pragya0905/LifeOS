// Settings-driven motion/sound preferences — separate from (and layered on top of)
// prefers-reduced-motion, which always wins regardless of these. No haptics/vibration
// anywhere in the app, so there's no corresponding toggle for that.
const ANIMATIONS_KEY = "lifeos_animations_enabled";
const SOUND_KEY = "lifeos_sound_enabled";
const EVENING_HOUR_KEY = "lifeos_evening_hour";

export const DEFAULT_EVENING_HOUR = 18;

export function loadAnimationsEnabled(): boolean {
  try {
    return localStorage.getItem(ANIMATIONS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveAnimationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ANIMATIONS_KEY, enabled ? "1" : "0");
  } catch {
    // best-effort
  }
}

export function loadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
  } catch {
    // best-effort
  }
}

export function loadEveningHour(): number {
  try {
    const raw = Number(localStorage.getItem(EVENING_HOUR_KEY));
    return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : DEFAULT_EVENING_HOUR;
  } catch {
    return DEFAULT_EVENING_HOUR;
  }
}

export function saveEveningHour(hour: number): void {
  try {
    localStorage.setItem(EVENING_HOUR_KEY, String(hour));
  } catch {
    // best-effort
  }
}

// The actual gate animation/celebration code should check — settings toggle AND the OS-level
// reduced-motion preference both have to allow motion.
export function motionAllowed(): boolean {
  if (!loadAnimationsEnabled()) return false;
  if (typeof window === "undefined") return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The short "pop" on a status button flipping to its completed/active state — same gate as
// motionAllowed, as a ready-to-use className so call sites don't each re-check it.
export function checkAnimationClass(): string {
  return motionAllowed() ? "animate-pop" : "";
}
