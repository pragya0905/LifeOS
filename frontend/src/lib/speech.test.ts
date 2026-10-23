import { describe, it, expect } from "vitest";
import { classifySpeechError, pickVoice, speakableText, splitSentences } from "./speech";

describe("classifySpeechError", () => {
  it("treats a blocked microphone as a permission problem", () => {
    expect(classifySpeechError("not-allowed")).toBe("permission");
  });

  it("recognises silence and a lost connection", () => {
    expect(classifySpeechError("no-speech")).toBe("no-speech");
    expect(classifySpeechError("network")).toBe("offline");
  });

  it("ignores our own stop being acknowledged", () => {
    expect(classifySpeechError("aborted")).toBeNull();
  });

  it("calls everything else a failure, including a refused speech service", () => {
    for (const code of ["audio-capture", "service-not-allowed", "language-not-supported", "bad-grammar", "something-new"]) {
      expect(classifySpeechError(code), code).toBe("failed");
    }
  });
});

describe("pickVoice", () => {
  const v = (name: string, lang: string, localService: boolean) => ({ name, lang, localService });

  it("prefers an exact language match", () => {
    const voices = [v("US", "en-US", true), v("India", "en-IN", false), v("Hindi", "hi-IN", true)];
    expect(pickVoice(voices, "en-IN")?.name).toBe("India");
    expect(pickVoice(voices, "hi-IN")?.name).toBe("Hindi");
  });

  it("prefers an on-device voice among equal matches", () => {
    const voices = [v("Network", "en-IN", false), v("Local", "en-IN", true)];
    expect(pickVoice(voices, "en-IN")?.name).toBe("Local");
  });

  it("falls back to the same language in another region", () => {
    expect(pickVoice([v("UK", "en-GB", true), v("Hindi", "hi-IN", true)], "en-IN")?.name).toBe("UK");
  });

  it("accepts the underscore form some Android voices report", () => {
    expect(pickVoice([v("India", "en_IN", true)], "en-IN")?.name).toBe("India");
  });

  it("returns nothing when no voice fits, so the browser default is used", () => {
    expect(pickVoice([v("French", "fr-FR", true)], "hi-IN")).toBeUndefined();
    expect(pickVoice([], "en-IN")).toBeUndefined();
  });
});

describe("splitSentences", () => {
  it("splits on sentence ends and line breaks", () => {
    expect(splitSentences("Added milk. Anything else? Sure!")).toEqual(["Added milk.", "Anything else?", "Sure!"]);
    expect(splitSentences("Your tasks:\n- Milk\n- Eggs")).toEqual(["Your tasks:", "- Milk", "- Eggs"]);
  });
  it("splits Hindi on the danda", () => {
    expect(splitSentences("ठीक है। मैंने जोड़ दिया।")).toEqual(["ठीक है।", "मैंने जोड़ दिया।"]);
  });
  it("keeps decimals and amounts together", () => {
    expect(splitSentences("It cost 3.5 dollars. Done.")).toEqual(["It cost 3.5 dollars.", "Done."]);
  });
  it("joins a bare list number to its item", () => {
    expect(splitSentences("1. Milk\n2. Eggs")).toEqual(["1. Milk", "2. Eggs"]);
  });
  it("returns nothing for blank text", () => {
    expect(splitSentences("  \n ")).toEqual([]);
  });
});

describe("speakableText", () => {
  it("drops markdown marks and keeps link text", () => {
    expect(speakableText("**Done** — see [your list](https://x.y)")).toBe("Done — see your list");
    expect(speakableText("- Milk")).toBe("Milk");
  });
});
