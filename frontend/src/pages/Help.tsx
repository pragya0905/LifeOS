import { card, mutedText, page, pageTitle, sectionLabel } from "../components/ui";

interface Section {
  title: string;
  body: string;
  intro?: string;
  bullets?: string[];
}

const SECTIONS: Section[] = [
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
    body: "",
    intro:
      "Your to-do list, organized so the urgent stuff finds you instead of the other way around.",
    bullets: [
      "🔥 Sections do the sorting for you — Overdue, Today, Upcoming, No due date, and Done, each ordered soonest-first so you never have to hunt.",
      "⚡ Quick add: type a title, hit ➕ Add task. Everything else — due date, estimate, priority — is optional at that point.",
      "🎤 Don't want to type? Tap Voice input on either Title or Description and dictate instead — both fields listen independently.",
      "📅 Due date is required and defaults to a raw date picker, but the Today / Tomorrow / Next week chips underneath set it in one tap.",
      "🤖 Suggest with AI is on by default — Claude reads the title, description, due date, and estimate together to pick Low/Medium/High. Pick a priority yourself and it switches off automatically, since that's you overriding it on purpose.",
      "⏱️ Est. hours matters more than it looks — if the time left before your deadline can't fit that many hours, priority is forced to High automatically, no AI call needed.",
      "◔ The small ring next to each task's title is a glance-only deadline meter — the more it's filled, the less slack you have left.",
      "○ Tap the status pill to cycle To do → In progress → Done — no dropdown hunting.",
      "👉 On your phone, swipe a task right to mark it done instantly.",
      "🔁 Duplicate clones a task's title, description, priority, and estimate — handy for anything you do on repeat.",
      "🔍 The search box filters by title as you type once you've got more than a couple of tasks.",
    ],
  },
  {
    title: "Calendar",
    body: "",
    intro: "A month-grid view of your tasks by due date — the wider-lens companion to the flat Tasks list.",
    bullets: [
      "🗓️ Each day shows up to 3 tasks due that day, color-coded by priority, with a \"+N more\" count if there are more.",
      "🎉 Indian public holidays and major festivals for 2026 are marked directly on their date.",
      "🟠 Saturdays and Sundays are tinted so the week's shape is obvious at a glance.",
      "◎ Today's cell gets a ring outline so you can find it instantly on a busy month.",
      "◀️▶️ Prev / Today / Next move you month to month — Today always jumps straight back to now.",
      "👉 Manage tasks at the bottom drops you back into the full Tasks list to actually edit anything.",
    ],
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
            {section.bullets ? (
              <>
                {section.intro && (
                  <p className="mb-2 text-sm text-ink dark:text-paper">{section.intro}</p>
                )}
                <ul className="flex flex-col gap-1.5">
                  {section.bullets.map((bullet, i) => (
                    <li key={i} className="text-sm text-ink dark:text-paper">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-ink dark:text-paper">{section.body}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
