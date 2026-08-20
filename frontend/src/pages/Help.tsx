import { card, mutedText, page, pageTitle, sectionLabel } from "../components/ui";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Dashboard",
    body: "Your daily snapshot: at-a-glance progress rings for water/sleep/exercise/steps (with streaks and trend vs. yesterday), today's scheduled tasks, today's habit table, the Extraction Ledger, and a preview of upcoming tasks.",
  },
  {
    title: "Journal",
    body: "Write or dictate a free-text entry for any date. Claude reads it and automatically fills in matching fields elsewhere — water intake, exercise, sleep, mood, medications taken, routine steps, calls, expenses, cycle events. A manually-entered value always takes priority over one Claude extracted, so nothing you type gets silently overwritten. Includes mood picker, prompt starters, and search.",
  },
  {
    title: "Tasks",
    body: "To-dos with priority, due date/time, and an optional AI priority suggestion that automatically escalates to High once there isn't enough time left before the deadline to fit the estimated effort. Includes search and one-click duplication for repeat tasks.",
  },
  {
    title: "Calendar",
    body: "A month view of your tasks by due date, for a wider-lens view than the flat Tasks list.",
  },
  {
    title: "Medications",
    body: "Track active medications and mark each as taken/missed per day, with a 14-day adherence percentage.",
  },
  {
    title: "Logs",
    body: "A generic log for anything that doesn't fit elsewhere: food, sleep, weight, body fat %, mood, calls, expenses, cycle events. Filterable by type and searchable.",
  },
  {
    title: "Cycle",
    body: "Log period start/end and symptoms; once you've logged two period starts, it predicts your next one. Private to your account like everything else.",
  },
  {
    title: "Routines",
    body: "Multi-step checklists (e.g. AM/PM skincare) with a done/skipped state per step per day, and a few starter templates.",
  },
  {
    title: "Insights",
    body: "On-demand AI-generated summary, highlights, and suggestions from your recent activity (today or this past week). Nothing runs automatically — you trigger it.",
  },
  {
    title: "Wishes",
    body: "Goals and dreams with real progress tracking — a percentage slider, a milestone checklist, tied to how much of a daily habit you've logged since creating the wish, a countdown to a date, or a quantity target. Attach photos as a small vision board. You'll get a push reminder as a deadline approaches, a one-time nudge if you're falling behind schedule, and a celebration when every milestone is checked off.",
  },
  {
    title: "Settings",
    body: "Install the app to your home screen, enable notifications and task due-date reminders, set your profile height, switch light/dark/system theme, export your data as CSV or PDF, and delete your account.",
  },
];

export default function Help() {
  return (
    <div className={page}>
      <h1 className={pageTitle}>Help</h1>
      <p className={`mb-6 ${mutedText}`}>What each part of LifeOs does.</p>
      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className={card}>
            <h2 className={`mb-1 ${sectionLabel}`}>{section.title}</h2>
            <p className="text-sm text-ink dark:text-paper">{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
