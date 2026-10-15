import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Icon } from "./Icon";
import { mutedText, sectionLabel } from "./ui";

export interface TimelineItem {
  key: string;
  time: string | null; // "HH:MM", local — null sorts into the "Anytime" group below
  domain: "task" | "routine" | "medication";
  label: string;
  sublabel?: string;
  completed: boolean;
  overdue?: boolean;
  pending: boolean;
  onComplete: () => void;
}

// One accent per domain (lib/urgency.ts's palette is reserved for priority/status, not
// domain identity) so a mixed list still reads at a glance which kind of item each row is.
const DOMAIN_DOT_CLASS: Record<TimelineItem["domain"], string> = {
  task: "bg-bloom",
  routine: "bg-routine",
  medication: "bg-medication",
};

function currentTimeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TodayTimeline({ items, isToday }: { items: TimelineItem[]; isToday: boolean }) {
  const [now, setNow] = useState(currentTimeStr());

  useEffect(() => {
    const id = window.setInterval(() => setNow(currentTimeStr()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const timed = items.filter((i) => i.time !== null).sort((a, b) => (a.time! < b.time! ? -1 : a.time! > b.time! ? 1 : 0));
  const untimed = items.filter((i) => i.time === null);

  if (items.length === 0) {
    return <p className={mutedText}>Nothing scheduled — enjoy the open day.</p>;
  }

  // Index where the current-time marker belongs among the timed items.
  const markerIndex = isToday ? timed.findIndex((i) => i.time! >= now) : -1;

  return (
    <div className="flex flex-col gap-1">
      {timed.map((item, i) => (
        <div key={item.key}>
          {i === markerIndex && <NowMarker />}
          <TimelineRow item={item} />
        </div>
      ))}
      {isToday && markerIndex === -1 && timed.length > 0 && <NowMarker />}
      {untimed.length > 0 && (
        <div className="mt-2">
          <p className={`mb-1.5 ${sectionLabel}`}>Anytime</p>
          {untimed.map((item) => (
            <TimelineRow key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function NowMarker() {
  return (
    <div className="my-1 flex items-center gap-2" aria-hidden="true">
      <span className="h-1.5 w-1.5 rounded-full bg-alert" />
      <span className="h-px flex-1 bg-alert/50" />
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  return (
    <div className={`flex items-center gap-3 rounded-control px-2 py-2 ${item.completed ? "opacity-60" : ""}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOMAIN_DOT_CLASS[item.domain]}`} />
      <span className="w-12 shrink-0 text-xs tabular-nums text-ink-muted dark:text-mist-muted">{item.time ?? ""}</span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm text-ink dark:text-paper ${item.completed ? "line-through" : ""}`}>{item.label}</p>
        {item.sublabel && (
          <p className={`truncate text-xs ${item.overdue ? "font-medium text-alert" : "text-ink-muted dark:text-mist-muted"}`}>
            {item.sublabel}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={item.pending || item.completed}
        onClick={item.onComplete}
        aria-label={item.completed ? `${item.label} done` : `Mark ${item.label} done`}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-60 ${
          item.completed
            ? "border-success bg-success text-paper-card"
            : "border-stone text-ink-muted hover:bg-stone/40 dark:border-stone-dark dark:text-mist-muted dark:hover:bg-stone-dark/40"
        }`}
      >
        <Icon icon={Check} size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}
