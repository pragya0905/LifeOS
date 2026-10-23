import { describe, expect, it } from "vitest";
import { toolErrorMessage } from "./toolErrors";

const FALLBACK = "I couldn't finish that. Try again, or check the details in the app.";

describe("toolErrorMessage", () => {
  it("passes through a server-written error string", () => {
    expect(toolErrorMessage(JSON.stringify({ error: "Medication not found" }))).toBe("Medication not found");
  });

  it("falls back for non-JSON text such as a stack trace", () => {
    expect(toolErrorMessage("TypeError: Cannot read properties of undefined\n    at handler")).toBe(FALLBACK);
  });

  it("falls back when the JSON has no error string", () => {
    expect(toolErrorMessage(JSON.stringify({ message: "nope" }))).toBe(FALLBACK);
    expect(toolErrorMessage(JSON.stringify(["error"]))).toBe(FALLBACK);
    expect(toolErrorMessage("null")).toBe(FALLBACK);
  });

  it("falls back for an empty or whitespace error", () => {
    expect(toolErrorMessage(JSON.stringify({ error: "   " }))).toBe(FALLBACK);
    expect(toolErrorMessage("")).toBe(FALLBACK);
  });

  it("caps the length at 200 characters", () => {
    const long = "x".repeat(500);
    expect(toolErrorMessage(JSON.stringify({ error: long })).length).toBe(200);
  });
});
