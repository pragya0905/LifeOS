import { describe, expect, it } from "vitest";
import { SINGULAR_LOG_TYPES } from "./logEntrySchemas";

describe("SINGULAR_LOG_TYPES", () => {
  // Regression test: cycle was once wrongly listed here, sharing sleep/weight/mood's
  // one-entry-per-day deterministic id scheme — logging a symptom on a day a period was also
  // logged silently overwrote the period entry, since both resolved to the same "{date}-cycle"
  // id. A day can legitimately hold multiple distinct cycle entries (a period event AND a
  // symptom), so it must never be treated as "one value per day" again.
  it("does not include cycle", () => {
    expect(SINGULAR_LOG_TYPES).not.toContain("cycle");
  });

  it("still includes the log types that genuinely are one-value-per-day", () => {
    expect(SINGULAR_LOG_TYPES).toContain("sleep");
    expect(SINGULAR_LOG_TYPES).toContain("weight");
    expect(SINGULAR_LOG_TYPES).toContain("mood");
  });
});
