import { describe, it, expect } from "vitest";
import { INTERRUPTED_NOTE, UNANSWERED_NOTE, dividerLabel, formatDuration, voiceTurnsToMessages } from "./voiceTranscript";
import type { VoiceTurn } from "../hooks/useVoiceSession";

const turn = (over: Partial<VoiceTurn> = {}): VoiceTurn => ({
  transcript: "add milk",
  reply: "Added milk.",
  toolResults: [],
  toolFailures: [],
  quietNotes: [],
  interrupted: false,
  unanswered: false,
  createdAt: "2026-10-23T10:00:00.000Z",
  ...over,
});

describe("voice transcript", () => {
  it("formats durations as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65_400)).toBe("1:05");
  });

  it("pluralises the divider", () => {
    expect(dividerLabel(1, 5000)).toBe("Voice session · 1 turn · 0:05");
    expect(dividerLabel(3, 125000)).toBe("Voice session · 3 turns · 2:05");
  });

  it("appends nothing for an empty session", () => {
    expect(voiceTurnsToMessages([], 1000)).toEqual([]);
  });

  it("adds one divider, then a voice user turn and an assistant turn per exchange", () => {
    const msgs = voiceTurnsToMessages([turn(), turn({ transcript: "thanks", reply: "Anytime." })], 90000);
    expect(msgs.map((m) => m.role)).toEqual(["assistant", "user", "assistant", "user", "assistant"]);
    expect(msgs[0].divider).toBe("Voice session · 2 turns · 1:30");
    expect(msgs[1]).toMatchObject({ content: "add milk", voice: true });
    expect(msgs[2].content).toBe("Added milk.");
  });

  it("notes an interrupted turn plainly and an unanswered one separately", () => {
    const msgs = voiceTurnsToMessages([turn({ interrupted: true }), turn({ unanswered: true, reply: "" })], 1000);
    expect(msgs[2].quietNotes).toEqual([INTERRUPTED_NOTE]);
    expect(msgs[4].quietNotes).toEqual([UNANSWERED_NOTE]);
  });
});
