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
    body: "",
    intro:
      "Write freely, and let Claude do the tedious work of filling in the rest of the app for you.",
    bullets: [
      "✍️ One entry per day — pick a date, and if it already has an entry, the form loads it for editing instead of letting you create a duplicate.",
      "🎤 Voice input dictates straight into the entry box, independent of typing — stop and start it anytime, on Android or desktop.",
      "🤖 Claude reads what you wrote and quietly fills in matching fields elsewhere — water, exercise, steps, sleep times, weight, mood, expenses, medications taken, routine steps, calls, cycle events. Nothing you typed manually is ever overwritten by what Claude extracted.",
      "😊 The Mood picker (1–5) sits right on the form, and 4 starter prompts are one tap away if you're staring at a blank page.",
      "📖 Past entries show a mood emoji, a Voice badge if dictated, and truncate past 280 characters with a Show more/less toggle so the list stays scannable.",
      "✏️ Tap Edit on any past entry to jump straight back into editing it — no manually hunting for the right date.",
      "🔍 Search filters your entries by text as you type.",
      "📋 The Extraction Ledger on the Dashboard shows exactly what Claude picked up from your latest entry — nothing runs silently in the background.",
    ],
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
      "👆 Tap any day to open it — see every task due that day (not just the first 3) and its status at a glance.",
      "➕ From that same popup, \"Add task for this day\" takes you straight to Tasks with the due date already filled in.",
      "🎉 Indian public holidays and major festivals for 2026 are marked directly on their date — tap the day to see the full name.",
      "🟠 Saturdays and Sundays are tinted so the week's shape is obvious at a glance.",
      "◎ Today's cell gets a ring outline so you can find it instantly on a busy month.",
      "◀️▶️ Prev / Today / Next move you month to month, or jump straight to any month/year with the two dropdowns next to the month name.",
      "👉 Manage tasks at the bottom drops you back into the full Tasks list to actually edit anything.",
    ],
  },
  {
    title: "Medications",
    body: "",
    intro: "Track active medications and stay on top of actually taking them, not just logging them.",
    bullets: [
      "💊 Add a medication with an optional dosage (e.g. \"500mg\") and notes (e.g. \"take with food\") alongside its name and duration.",
      "🔔 Set a daily reminder time and you'll get a push notification around that time each day the medication is active — skipped automatically if you've already marked it taken.",
      "✅ Mark each active medication Taken or Missed for today with one tap.",
      "📊 A 14-day adherence percentage shows on every medication in the full list, color-coded so a slipping streak is obvious at a glance.",
    ],
  },
  {
    title: "Logs",
    body: "A generic log for anything that doesn't fit elsewhere: food, sleep, weight, body fat %, mood, calls, cycle events. Filterable by type and searchable.",
  },
  {
    title: "Budget",
    body: "",
    intro: "Track spending by category against monthly budgets you set once — no need to recreate them every month.",
    bullets: [
      "💸 Log an expense with a category, amount in ₹, and optional note — the same categories Journal AI-extraction uses when you mention a purchase in an entry.",
      "💰 Set an overall monthly budget for This month — your spending total is measured against it, and it's the ceiling every category budget has to fit under.",
      "🎯 Set a recurring monthly limit per category once; it applies every month going forward until you change or remove it. Category budgets can't collectively exceed your overall monthly budget.",
      "📊 Each category with a budget shows a spent-vs-limit progress bar and either the amount remaining, or how far over you've gone flagged in red.",
      "🍩 The category breakdown bar shows where this month's spending actually went, at a glance.",
      "📅 Flip between months with Prev/Next to review past spending or catch up on a month you fell behind logging.",
      "🗑️ Delete any expense or remove a category's budget entirely from its card.",
    ],
  },
  {
    title: "Cycle",
    body: "",
    intro: "Log period start/end and symptoms, and let LifeOs turn that history into predictions — private to your account like everything else.",
    bullets: [
      "🩸 My period started today logs a period-start entry for today in one tap — no need to fill the full form for the most common entry.",
      "🌙 The colour-coded overview card estimates the cycle phase — Menstrual, Follicular, Ovulation, or Luteal — for any date you pick, with a segmented bar showing where that day sits in the cycle and a short note on what mood/energy tends to look like there. It's an estimate from your own averages, not a medical prediction.",
      "🔮 Once you've logged two period starts, the same card shows your average cycle length, next predicted period, and (once you've logged a matching end date too) your average period length.",
      "🗂️ Entries are grouped into per-cycle blocks (\"Cycle starting …\") once you've logged a period start, so you can see each cycle's events together instead of one long flat list.",
      "📊 Symptom patterns attributes every symptom you've logged to the estimated phase it fell in, and calls out which phase they cluster in most — so you can spot things like symptoms trending toward your luteal phase over time.",
      "🔔 You'll get a push reminder around the time your next period is predicted, once you've logged enough cycles for a prediction — sent once per predicted date, not repeated.",
    ],
  },
  {
    title: "Routines",
    body: "",
    intro: "Multi-step checklists — AM/PM skincare, a morning routine, or anything else you do the same way daily.",
    bullets: [
      "📋 A few starter templates (AM/PM skincare, 30-30-30 morning) fill in the category, name, and steps for you — tweak before saving or use as-is.",
      "✅ Mark each step Done or Skipped for today; a live count shows how much of the routine you've finished.",
      "✏️ Edit a routine's name, category, or steps any time — no need to delete and recreate it to fix a typo or add a step.",
      "🔥 A streak badge shows how many consecutive days you've completed every step — a single skipped or missing step breaks it, but today never breaks a streak just because it isn't finished yet.",
      "🗑️ Delete a routine you no longer follow.",
    ],
  },
  {
    title: "Insights",
    body: "On-demand AI-generated summary, highlights, and suggestions from your recent activity (today or this past week). Nothing runs automatically — you trigger it.",
  },
  {
    title: "Wishes",
    body: "",
    intro: "Goals and dreams, tracked however actually fits the goal — not one rigid format for all of them.",
    bullets: [
      "🎯 Pick a tracking style per wish: a percentage slider, a milestone checklist, tied to how much of a daily habit (water/exercise/steps) you've logged since creating it, a countdown to a date, or a quantity target.",
      "📚✈️💰 Each wish gets a type (Learning, Travel, Savings, Health, Shopping, Creative, Personal growth, Achievement) shown as an emoji badge, set from the Type dropdown when you create it.",
      "⏰ Active wishes sort by closest target date first — a Due soon group up top, and a separate No target date group for the ones without a deadline.",
      "🔍 Search filters your wishes by title.",
      "🖼️ Attach photos to any wish as a small vision board.",
      "🔔 You'll get a push reminder as a deadline approaches, a one-time nudge if you're falling behind schedule, and a celebration the moment every milestone is checked off.",
      "🗂️ Wishes that are completed or abandoned move to their own section below, out of the way but not deleted.",
    ],
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
