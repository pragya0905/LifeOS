import { describe, expect, it } from "vitest";
import { localDateStr, routineReminderDate } from "./routineReminders";

// India is UTC+5:30, which is getTimezoneOffset() === -330.
const IST = -330;
const base = { timeOfDay: "07:00", remindMe: true, timezoneOffsetMinutes: IST };

describe("routineReminderDate", () => {
  it("fires when the start time falls in the next window (07:00 IST is 01:30 UTC)", () => {
    const now = new Date("2026-10-24T01:25:00Z");
    expect(routineReminderDate(base, now, 15)).toBe("2026-10-24");
  });

  it("does not fire outside the window", () => {
    expect(routineReminderDate(base, new Date("2026-10-24T01:00:00Z"), 15)).toBeNull();
    expect(routineReminderDate(base, new Date("2026-10-24T01:40:00Z"), 15)).toBeNull();
  });

  it("fires earlier by the lead time", () => {
    const withLead = { ...base, reminderLeadMinutes: 10 };
    expect(routineReminderDate(withLead, new Date("2026-10-24T01:17:00Z"), 15)).toBe("2026-10-24");
  });

  it("does nothing unless the user turned reminders on", () => {
    expect(routineReminderDate({ ...base, remindMe: false }, new Date("2026-10-24T01:25:00Z"), 15)).toBeNull();
  });

  it("does nothing without a time or a saved timezone", () => {
    expect(routineReminderDate({ ...base, timeOfDay: undefined }, new Date("2026-10-24T01:25:00Z"), 15)).toBeNull();
    expect(routineReminderDate({ ...base, timezoneOffsetMinutes: undefined }, new Date("2026-10-24T01:25:00Z"), 15)).toBeNull();
  });

  it("does not repeat on the same local day", () => {
    expect(routineReminderDate({ ...base, lastReminderSentDate: "2026-10-24" }, new Date("2026-10-24T01:25:00Z"), 15)).toBeNull();
  });

  it("skips days the routine doesn't run on", () => {
    // 2026-10-24 is a Saturday (6); this routine runs Monday only.
    expect(routineReminderDate({ ...base, daysOfWeek: [1] }, new Date("2026-10-24T01:25:00Z"), 15)).toBeNull();
    expect(routineReminderDate({ ...base, daysOfWeek: [6] }, new Date("2026-10-24T01:25:00Z"), 15)).toBe("2026-10-24");
  });

  it("uses the user's local date, not UTC's", () => {
    // 23:50 UTC on the 23rd is already 05:20 IST on the 24th.
    expect(localDateStr(new Date("2026-10-23T23:50:00Z"), IST)).toBe("2026-10-24");
  });
});
