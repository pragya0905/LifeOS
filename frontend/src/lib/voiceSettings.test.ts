import { describe, it, expect, beforeEach, vi } from "vitest";

function installStorage(initial: Record<string, string> = {}, broken = false) {
  const data = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      if (broken) throw new Error("blocked");
      return k in data ? data[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error("blocked");
      data[k] = v;
    },
  });
  return data;
}

beforeEach(() => {
  vi.resetModules();
});

describe("voice settings", () => {
  it("defaults to English (India), replies on, privacy not yet accepted", async () => {
    installStorage();
    const s = await import("./voiceSettings");
    expect(s.loadLang()).toBe("en-IN");
    expect(s.loadMuted()).toBe(false);
    expect(s.privacyAccepted()).toBe(false);
  });

  it("round-trips the settings", async () => {
    installStorage();
    const s = await import("./voiceSettings");
    s.saveLang("hi-IN");
    s.saveMuted(true);
    s.acceptPrivacy();
    expect(s.loadLang()).toBe("hi-IN");
    expect(s.loadMuted()).toBe(true);
    expect(s.privacyAccepted()).toBe(true);
  });

  it("honours the old muted key until the new one is written", async () => {
    installStorage({ lifeos_assistant_muted: "1" });
    const s = await import("./voiceSettings");
    expect(s.loadMuted()).toBe(true);
    s.saveMuted(false);
    expect(s.loadMuted()).toBe(false);
  });

  it("survives blocked storage", async () => {
    installStorage({}, true);
    const s = await import("./voiceSettings");
    expect(() => {
      s.saveLang("hi-IN");
      s.saveMuted(true);
      s.acceptPrivacy();
    }).not.toThrow();
    expect(s.loadLang()).toBe("en-IN");
    expect(s.loadMuted()).toBe(false);
    expect(s.privacyAccepted()).toBe(false);
  });
});
