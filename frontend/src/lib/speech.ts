// Pure helpers behind the speech hooks, so they can be tested without a browser. Nothing here
// touches the network or the microphone.

export type SpeechErrorKind =
  // The browser or the user blocked the microphone.
  | "permission"
  // The recognition session heard nothing before it timed out.
  | "no-speech"
  // No connection: Chrome's recognition sends audio to a server, so it needs one.
  | "offline"
  // Anything else the speech service reports (no audio device, service refused, language, ...).
  | "failed"
  // This browser has no speech recognition at all.
  | "unsupported";

// Maps a SpeechRecognition `error` code to what the voice screen should say about it. Returns
// null for "aborted", which is just our own stop() being acknowledged, not a failure.
export function classifySpeechError(code: string): SpeechErrorKind | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
      return "permission";
    case "no-speech":
      return "no-speech";
    case "network":
      return "offline";
    // "service-not-allowed" means the browser refused the speech *service* (policy, insecure
    // origin), not that the user blocked the microphone, so it is a failure, not a permission fix.
    default:
      return "failed";
  }
}

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
}

function norm(lang: string): string {
  return lang.replace("_", "-").toLowerCase();
}

// Picks the best installed voice for a language: an exact match (en-IN) first, then any voice
// for the same language (en-*), preferring on-device voices since they work offline and start
// faster. Returns undefined when the phone has nothing suitable, so the browser's default is used.
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: string): T | undefined {
  const want = norm(lang);
  const base = want.split("-")[0];
  const best = (list: T[]) => list.find((v) => v.localService) ?? list[0];
  const exact = voices.filter((v) => norm(v.lang) === want);
  if (exact.length > 0) return best(exact);
  const same = voices.filter((v) => norm(v.lang).split("-")[0] === base);
  return same.length > 0 ? best(same) : undefined;
}
