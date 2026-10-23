// The voice session as a pure state machine. It decides what state comes next; it never touches
// the microphone, the speaker or the network. The hook that runs a session watches this state and
// does the matching work, so every rule below is testable on its own.

export type VoiceLang = "en-IN" | "hi-IN";

export type VoiceStatus =
  // No session. Also the state after it ends.
  | "closed"
  | "listening"
  | "thinking"
  | "speaking"
  // The mic is off and nothing is heard or sent. Only an explicit resume leaves this state.
  | "paused"
  | "error"
  // Switched to typing: the session is kept, the mic and voice are off, and voice can resume.
  | "typing"
  | "ended";

export type VoiceErrorKind = "permission" | "offline" | "no-speech" | "stt" | "assistant";
export type EndReason = "user" | "silence" | "pause-timeout";

// Two no-speech timeouts in a row end the session by themselves.
export const NO_SPEECH_LIMIT = 2;
// A session left paused this long ends by itself.
export const PAUSE_TIMEOUT_MS = 5 * 60 * 1000;

export interface VoiceState {
  status: VoiceStatus;
  // What the user is saying (interim text while listening, the final sentence after).
  caption: string;
  lastTranscript: string;
  noSpeechCount: number;
  error: VoiceErrorKind | null;
  endReason: EndReason | null;
  // Pause was asked for during a reply (or the app was backgrounded): the reply finishes first,
  // then the session lands in Paused instead of listening again.
  pauseAfterReply: boolean;
  // The app was hidden while a reply was coming: when it arrives it is not spoken, and the
  // session lands in Paused.
  skipSpeech: boolean;
  muted: boolean;
  lang: VoiceLang;
  // The last reply was cut off by the user.
  interrupted: boolean;
  // Bumped each time listening (re)starts, so the runner can tell a fresh listen from a re-render.
  listenId: number;
}

export type VoiceEvent =
  | { type: "OPEN" }
  | { type: "RESULT_INTERIM"; text: string }
  | { type: "RESULT_FINAL"; text: string }
  | { type: "NO_SPEECH" }
  | { type: "STT_ERROR"; kind: "permission" | "offline" | "failed" }
  | { type: "REPLY_DONE"; hasSpeech: boolean }
  | { type: "ASSISTANT_ERROR" }
  | { type: "SPEECH_ENDED" }
  | { type: "INTERRUPT" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "BACKGROUNDED" }
  | { type: "RETRY" }
  | { type: "TYPE_INSTEAD" }
  | { type: "TOGGLE_MUTE" }
  | { type: "SET_LANG"; lang: VoiceLang }
  | { type: "PAUSE_TIMEOUT" }
  | { type: "END" };

export function initialVoiceState(settings: { lang: VoiceLang; muted: boolean }): VoiceState {
  return {
    status: "closed",
    caption: "",
    lastTranscript: "",
    noSpeechCount: 0,
    error: null,
    endReason: null,
    pauseAfterReply: false,
    skipSpeech: false,
    muted: settings.muted,
    lang: settings.lang,
    interrupted: false,
    listenId: 0,
  };
}

export const isActive = (s: VoiceStatus): boolean =>
  s === "listening" || s === "thinking" || s === "speaking" || s === "paused" || s === "error";

function listen(s: VoiceState, patch: Partial<VoiceState> = {}): VoiceState {
  return { ...s, ...patch, status: "listening", error: null, caption: "", pauseAfterReply: false, skipSpeech: false, listenId: s.listenId + 1 };
}

// After a reply (or its speech) is over: listen again, or pause if that was asked for.
function afterReply(s: VoiceState): VoiceState {
  return s.pauseAfterReply
    ? { ...s, status: "paused", caption: "", pauseAfterReply: false, skipSpeech: false }
    : listen(s);
}

export function voiceReducer(s: VoiceState, e: VoiceEvent): VoiceState {
  switch (e.type) {
    case "OPEN":
      // A new session starts clean. From typing, OPEN is not used: RESUME brings voice back.
      if (s.status === "closed" || s.status === "ended") {
        return listen({ ...s, noSpeechCount: 0, endReason: null, lastTranscript: "", interrupted: false });
      }
      return s;

    case "RESULT_INTERIM":
      return s.status === "listening" ? { ...s, caption: e.text } : s;

    case "RESULT_FINAL": {
      if (s.status !== "listening") return s;
      const text = e.text.trim();
      if (!text) return s;
      return { ...s, status: "thinking", caption: text, lastTranscript: text, noSpeechCount: 0, interrupted: false, error: null };
    }

    case "NO_SPEECH": {
      if (s.status !== "listening") return s;
      const count = s.noSpeechCount + 1;
      if (count >= NO_SPEECH_LIMIT) return { ...s, status: "ended", endReason: "silence", noSpeechCount: count, caption: "", error: null };
      return { ...s, status: "error", error: "no-speech", noSpeechCount: count, caption: "" };
    }

    case "STT_ERROR":
      if (s.status !== "listening") return s;
      return { ...s, status: "error", error: e.kind === "failed" ? "stt" : e.kind, caption: "" };

    case "REPLY_DONE": {
      if (s.status !== "thinking") return s;
      // Backgrounded while the reply was coming: it is shown but never spoken.
      if (s.skipSpeech) return { ...s, status: "paused", caption: "", pauseAfterReply: false, skipSpeech: false };
      if (s.muted || !e.hasSpeech) return afterReply(s);
      return { ...s, status: "speaking" };
    }

    case "ASSISTANT_ERROR":
      if (s.status !== "thinking") return s;
      return { ...s, status: "error", error: "assistant", pauseAfterReply: false, skipSpeech: false };

    case "SPEECH_ENDED":
      return s.status === "speaking" ? afterReply(s) : s;

    case "INTERRUPT":
      if (s.status !== "thinking" && s.status !== "speaking") return s;
      return { ...afterReply(s), interrupted: true };

    case "PAUSE":
      if (s.status === "listening") return { ...s, status: "paused", caption: "" };
      if (s.status === "thinking" || s.status === "speaking") return { ...s, pauseAfterReply: true };
      return s;

    case "RESUME":
      if (s.status === "paused" || s.status === "typing") return listen(s, { noSpeechCount: 0 });
      return s;

    case "BACKGROUNDED":
      // Never leave the mic live or the voice talking in the background, and never resume by itself.
      if (s.status === "listening" || s.status === "speaking") return { ...s, status: "paused", caption: "", pauseAfterReply: false };
      if (s.status === "thinking") return { ...s, skipSpeech: true };
      return s;

    case "RETRY": {
      if (s.status !== "error") return s;
      // The assistant failed: send the same words again. Anything else: listen again.
      if (s.error === "assistant") return { ...s, status: "thinking", error: null, caption: s.lastTranscript };
      return listen(s);
    }

    case "TYPE_INSTEAD":
      return isActive(s.status) ? { ...s, status: "typing", caption: "", error: null, pauseAfterReply: false, skipSpeech: false } : s;

    case "TOGGLE_MUTE": {
      const muted = !s.muted;
      // Muting while the voice is talking cuts it off, as if the reply had ended.
      if (muted && s.status === "speaking") return { ...afterReply(s), muted };
      return { ...s, muted };
    }

    case "SET_LANG":
      return { ...s, lang: e.lang };

    case "PAUSE_TIMEOUT":
      return s.status === "paused" ? { ...s, status: "ended", endReason: "pause-timeout" } : s;

    case "END":
      return s.status === "closed" || s.status === "ended" ? s : { ...s, status: "ended", endReason: "user", caption: "", error: null, pauseAfterReply: false, skipSpeech: false };
  }
}
