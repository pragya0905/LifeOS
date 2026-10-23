import type { VoiceLang } from "./voiceMachine";

// Voice preferences live in this browser only. Every access is wrapped: storage can be blocked
// (private window, site data off) and the page must work the same without it.

const LANG_KEY = "lifeos_voice_lang";
const MUTED_KEY = "lifeos_voice_muted";
const LEGACY_MUTED_KEY = "lifeos_assistant_muted";
const PRIVACY_KEY = "lifeos_voice_privacy_ok";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best effort: the setting just won't survive a reload.
  }
}

export function loadLang(): VoiceLang {
  return read(LANG_KEY) === "hi-IN" ? "hi-IN" : "en-IN";
}
export function saveLang(lang: VoiceLang) {
  write(LANG_KEY, lang);
}

// Spoken replies are on by default. The old toggle stored its choice under another key; that is
// honoured until the new key is written.
export function loadMuted(): boolean {
  const current = read(MUTED_KEY);
  if (current !== null) return current === "1";
  return read(LEGACY_MUTED_KEY) === "1";
}
export function saveMuted(muted: boolean) {
  write(MUTED_KEY, muted ? "1" : "0");
}

export function privacyAccepted(): boolean {
  return read(PRIVACY_KEY) === "1";
}
export function acceptPrivacy() {
  write(PRIVACY_KEY, "1");
}
