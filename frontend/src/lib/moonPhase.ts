import * as Astronomy from "astronomy-engine";
import { toLocalDateStr } from "./date";

export type MoonEvent = "purnima" | "amavasya";

export const MOON_EVENT_LABEL: Record<MoonEvent, string> = {
  purnima: "🌕 Purnima",
  amavasya: "🌑 Amavasya",
};

// astronomy-engine's moon-quarter numbering: 0 = new moon, 1 = first quarter,
// 2 = full moon, 3 = third quarter. Only the new/full moons are Amavasya/Purnima.
function quarterToEvent(quarter: number): MoonEvent | null {
  if (quarter === 0) return "amavasya";
  if (quarter === 2) return "purnima";
  return null;
}

// Maps every local calendar date in [rangeStart, rangeEnd) to a moon event, for each
// new/full moon whose astronomical moment falls within that window. Quarters are spaced
// roughly a week apart, so starting the search 10 days early guarantees the first quarter
// at/after rangeStart isn't missed.
export function getMoonEventsInRange(rangeStart: Date, rangeEnd: Date): Map<string, MoonEvent> {
  const events = new Map<string, MoonEvent>();
  let quarter = Astronomy.SearchMoonQuarter(new Date(rangeStart.getTime() - 10 * 24 * 60 * 60 * 1000));
  while (quarter.time.date < rangeEnd) {
    if (quarter.time.date >= rangeStart) {
      const event = quarterToEvent(quarter.quarter);
      if (event) events.set(toLocalDateStr(quarter.time.date), event);
    }
    quarter = Astronomy.NextMoonQuarter(quarter);
  }
  return events;
}
