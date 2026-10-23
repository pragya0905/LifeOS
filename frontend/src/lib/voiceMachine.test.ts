import { describe, it, expect } from "vitest";
import {
  NO_SPEECH_LIMIT,
  PAUSE_TIMEOUT_MS,
  initialVoiceState,
  isActive,
  voiceReducer,
  type VoiceEvent,
  type VoiceState,
} from "./voiceMachine";

const start = (over: Partial<VoiceState> = {}): VoiceState => ({
  ...voiceReducer(initialVoiceState({ lang: "en-IN", muted: false }), { type: "OPEN" }),
  ...over,
});
const run = (s: VoiceState, ...events: VoiceEvent[]): VoiceState => events.reduce(voiceReducer, s);
const heard = (text = "remind me to call Priya"): VoiceEvent[] => [{ type: "RESULT_INTERIM", text: "remind me" }, { type: "RESULT_FINAL", text }];

describe("a full hands-free loop", () => {
  it("starts closed, then listens when opened", () => {
    expect(initialVoiceState({ lang: "en-IN", muted: false }).status).toBe("closed");
    expect(start().status).toBe("listening");
  });

  it("listens, thinks, speaks and listens again, each time with a fresh listen id", () => {
    const first = start();
    let s = run(first, { type: "RESULT_INTERIM", text: "remind me" });
    expect(s).toMatchObject({ status: "listening", caption: "remind me" });
    s = run(s, { type: "RESULT_FINAL", text: "remind me to call Priya" });
    expect(s).toMatchObject({ status: "thinking", caption: "remind me to call Priya", lastTranscript: "remind me to call Priya" });
    s = run(s, { type: "REPLY_DONE", hasSpeech: true });
    expect(s.status).toBe("speaking");
    s = run(s, { type: "SPEECH_ENDED" });
    expect(s.status).toBe("listening");
    expect(s.listenId).toBeGreaterThan(first.listenId);
    expect(s.caption).toBe("");
  });

  it("goes straight back to listening when replies are muted or there is nothing to say", () => {
    expect(run(start({ muted: true }), ...heard(), { type: "REPLY_DONE", hasSpeech: true }).status).toBe("listening");
    expect(run(start(), ...heard(), { type: "REPLY_DONE", hasSpeech: false }).status).toBe("listening");
  });

  it("ignores an empty final result", () => {
    expect(run(start(), { type: "RESULT_FINAL", text: "   " }).status).toBe("listening");
  });

  it("OPEN only starts a session that is not already running", () => {
    const s = start();
    expect(run(s, { type: "OPEN" })).toBe(s);
    expect(run(s, { type: "END" }, { type: "OPEN" }).status).toBe("listening");
  });
});

describe("pause", () => {
  it("pauses the mic, and bystander speech that arrives late is not sent", () => {
    const s = run(start(), { type: "PAUSE" });
    expect(s.status).toBe("paused");
    const after = run(s, { type: "RESULT_INTERIM", text: "a bystander talking" }, { type: "RESULT_FINAL", text: "a bystander talking" });
    expect(after.status).toBe("paused");
    expect(after.lastTranscript).toBe("");
  });

  it("resumes only when asked, and listens fresh", () => {
    const paused = run(start(), { type: "PAUSE" });
    const s = run(paused, { type: "RESUME" });
    expect(s.status).toBe("listening");
    expect(s.listenId).toBeGreaterThan(paused.listenId);
  });

  it("pausing during a reply lets it finish and then pauses instead of listening", () => {
    let s = run(start(), ...heard(), { type: "PAUSE" });
    expect(s).toMatchObject({ status: "thinking", pauseAfterReply: true });
    s = run(s, { type: "REPLY_DONE", hasSpeech: true });
    expect(s.status).toBe("speaking");
    s = run(s, { type: "SPEECH_ENDED" });
    expect(s).toMatchObject({ status: "paused", pauseAfterReply: false });
  });

  it("pauses right after a muted reply", () => {
    expect(run(start({ muted: true }), ...heard(), { type: "PAUSE" }, { type: "REPLY_DONE", hasSpeech: true }).status).toBe("paused");
  });

  it("only a timeout, a resume or an end leaves Paused", () => {
    const s = run(start(), { type: "PAUSE" });
    expect(run(s, { type: "NO_SPEECH" }).status).toBe("paused");
    expect(run(s, { type: "SPEECH_ENDED" }).status).toBe("paused");
    expect(run(s, { type: "PAUSE_TIMEOUT" })).toMatchObject({ status: "ended", endReason: "pause-timeout" });
  });

  it("the pause timeout is five minutes and applies only while paused", () => {
    expect(PAUSE_TIMEOUT_MS).toBe(5 * 60 * 1000);
    expect(run(start(), { type: "PAUSE_TIMEOUT" }).status).toBe("listening");
  });
});

describe("silence", () => {
  it("the first no-speech shows a notice and waits for a retry", () => {
    const s = run(start(), { type: "NO_SPEECH" });
    expect(s).toMatchObject({ status: "error", error: "no-speech", noSpeechCount: 1 });
    expect(run(s, { type: "RETRY" }).status).toBe("listening");
  });

  it("two no-speech timeouts in a row end the session", () => {
    expect(NO_SPEECH_LIMIT).toBe(2);
    const s = run(start(), { type: "NO_SPEECH" }, { type: "RETRY" }, { type: "NO_SPEECH" });
    expect(s).toMatchObject({ status: "ended", endReason: "silence" });
  });

  it("hearing something in between resets the count", () => {
    const s = run(start(), { type: "NO_SPEECH" }, { type: "RETRY" }, ...heard(), { type: "REPLY_DONE", hasSpeech: false }, { type: "NO_SPEECH" });
    expect(s).toMatchObject({ status: "error", error: "no-speech", noSpeechCount: 1 });
  });

  it("resuming from a pause also resets the count", () => {
    const s = run(start(), { type: "NO_SPEECH" }, { type: "RETRY" }, { type: "PAUSE" }, { type: "RESUME" }, { type: "NO_SPEECH" });
    expect(s.status).toBe("error");
  });
});

describe("errors", () => {
  it("offline: shows the error, and a retry listens again", () => {
    const s = run(start(), { type: "STT_ERROR", kind: "offline" });
    expect(s).toMatchObject({ status: "error", error: "offline" });
    expect(run(s, { type: "RETRY" }).status).toBe("listening");
  });

  it("permission denied: a retry listens again once the user has allowed it, or they can type", () => {
    const s = run(start(), { type: "STT_ERROR", kind: "permission" });
    expect(s).toMatchObject({ status: "error", error: "permission" });
    expect(run(s, { type: "RETRY" }).status).toBe("listening");
    expect(run(s, { type: "TYPE_INSTEAD" }).status).toBe("typing");
  });

  it("a speech failure is its own error", () => {
    expect(run(start(), { type: "STT_ERROR", kind: "failed" })).toMatchObject({ status: "error", error: "stt" });
  });

  it("an assistant error keeps the words, and Retry sends them again", () => {
    let s = run(start(), ...heard("add milk"), { type: "ASSISTANT_ERROR" });
    expect(s).toMatchObject({ status: "error", error: "assistant", lastTranscript: "add milk" });
    s = run(s, { type: "RETRY" });
    expect(s).toMatchObject({ status: "thinking", caption: "add milk" });
  });
});

describe("interrupt", () => {
  it("tap-to-interrupt while speaking returns to listening and marks the reply cut off", () => {
    const s = run(start(), ...heard(), { type: "REPLY_DONE", hasSpeech: true }, { type: "INTERRUPT" });
    expect(s).toMatchObject({ status: "listening", interrupted: true });
  });

  it("Stop while thinking stops waiting and listens again", () => {
    expect(run(start(), ...heard(), { type: "INTERRUPT" })).toMatchObject({ status: "listening", interrupted: true });
  });

  it("interrupting after a pause request pauses instead", () => {
    expect(run(start(), ...heard(), { type: "PAUSE" }, { type: "INTERRUPT" }).status).toBe("paused");
  });

  it("does nothing when there is nothing to interrupt, and clears with the next sentence", () => {
    const s = start();
    expect(run(s, { type: "INTERRUPT" })).toBe(s);
    expect(run(s, ...heard(), { type: "INTERRUPT" }, { type: "RESULT_FINAL", text: "again" }).interrupted).toBe(false);
  });
});

describe("the app going to the background", () => {
  it("pauses a live mic", () => {
    expect(run(start(), { type: "BACKGROUNDED" }).status).toBe("paused");
  });

  it("stops the voice mid-reply and pauses", () => {
    expect(run(start(), ...heard(), { type: "REPLY_DONE", hasSpeech: true }, { type: "BACKGROUNDED" }).status).toBe("paused");
  });

  it("while a reply is coming, the reply arrives but is not spoken, and the session pauses", () => {
    const s = run(start(), ...heard(), { type: "BACKGROUNDED" });
    expect(s).toMatchObject({ status: "thinking", skipSpeech: true });
    expect(run(s, { type: "REPLY_DONE", hasSpeech: true }).status).toBe("paused");
  });

  it("never resumes by itself: nothing but an explicit resume leaves Paused", () => {
    const s = run(start(), { type: "BACKGROUNDED" });
    expect(run(s, { type: "RESULT_FINAL", text: "hello" }, { type: "NO_SPEECH" }, { type: "SPEECH_ENDED" }, { type: "BACKGROUNDED" }).status).toBe("paused");
    expect(run(s, { type: "RESUME" }).status).toBe("listening");
  });
});

describe("typing, mute, language and ending", () => {
  it("switching to typing keeps the session, ignores late speech, and voice can resume", () => {
    const typing = run(start(), ...heard(), { type: "TYPE_INSTEAD" });
    expect(typing.status).toBe("typing");
    expect(run(typing, { type: "RESULT_FINAL", text: "late" }, { type: "REPLY_DONE", hasSpeech: true }).status).toBe("typing");
    expect(run(typing, { type: "RESUME" }).status).toBe("listening");
  });

  it("muting during speech cuts it off and keeps listening; unmuting changes nothing else", () => {
    const speaking = run(start(), ...heard(), { type: "REPLY_DONE", hasSpeech: true });
    const muted = run(speaking, { type: "TOGGLE_MUTE" });
    expect(muted).toMatchObject({ status: "listening", muted: true });
    expect(run(muted, { type: "TOGGLE_MUTE" })).toMatchObject({ status: "listening", muted: false });
  });

  it("changes language", () => {
    expect(run(start(), { type: "SET_LANG", lang: "hi-IN" }).lang).toBe("hi-IN");
  });

  it("ending is final and idempotent", () => {
    const ended = run(start(), { type: "END" });
    expect(ended).toMatchObject({ status: "ended", endReason: "user" });
    expect(run(ended, { type: "END" })).toBe(ended);
  });

  it("knows which states show the voice screen", () => {
    for (const s of ["listening", "thinking", "speaking", "paused", "error"] as const) expect(isActive(s)).toBe(true);
    for (const s of ["closed", "typing", "ended"] as const) expect(isActive(s)).toBe(false);
  });
});
