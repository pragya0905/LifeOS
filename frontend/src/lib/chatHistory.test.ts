import { describe, it, expect } from "vitest";
import { LOAD_ERROR, openConversation } from "./chatHistory";

describe("opening a conversation from history", () => {
  const turns = [
    { role: "user" as const, content: "Hi there" },
    { role: "assistant" as const, content: "Hello" },
  ];

  it("opens a conversation that has turns", async () => {
    const r = await openConversation(async () => ({ turns }));
    expect(r).toEqual({ ok: true, messages: [{ role: "user", content: "Hi there" }, { role: "assistant", content: "Hello" }] });
  });

  it("treats an empty conversation as a failed load, not a blank chat", async () => {
    const r = await openConversation(async () => ({ turns: [] }));
    expect(r).toEqual({ ok: false, reason: LOAD_ERROR });
  });

  it("treats a malformed answer as a failed load", async () => {
    expect(await openConversation(async () => ({} as { turns: [] }))).toEqual({ ok: false, reason: LOAD_ERROR });
  });

  it("treats a thrown request as a failed load and keeps the reason", async () => {
    const r = await openConversation(async () => { throw new Error("500 Internal Server Error"); });
    expect(r).toEqual({ ok: false, reason: LOAD_ERROR });
  });
});
