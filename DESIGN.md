# LifeOS design rules

These are standing product/design decisions from direct user feedback across the redesign.
They apply to every page, not just the ones they were first said on. When a new request
conflicts with one of these, ask rather than silently overriding it.

## Interaction

- Primary actions are always visible. Never hide them behind "...", menus, swipe, or
  long-press. Status buttons are labeled (Done / Skipped / N/A, Taken / Skipped / Missed) —
  not icon-only, not behind a picker.
- Never truncate text the user needs to read: routine steps, instructions, titles, notes.
  Wrap it instead.
- Optimistic updates everywhere a status/value changes: update the UI immediately, show an
  Undo toast, and roll back to the pre-mutation state on failure.

## Status and color

- Status is always icon + label, never color alone.
- Priority: High = red, Medium = amber, Low = green.
- Routine/medication status: N/A = blue-gray (neutral, not a warning), Skipped = muted
  neutral, Done = green.

## Layout

- No decorative stat tiles, progress rings, banners, or "Next Up" cards. Calm and practical
  first, motivating second — a small flame, a short check animation, warm microcopy. No guilt
  wording, no haptics. Sound off by default. Respect `prefers-reduced-motion`.
- Flat/dense layout with left-rule groups (the Today "Variant B" style).
- Buttons at least 40px tall.
- Tabular numerals (`tabular-nums`) for every number.
- Phone-first: the user's primary device is a OnePlus 12R, ~412px wide. The global quick-add
  "+" button must never cover content.
- Both themes (light/dark/system) checked at 382px, 412px, 768px, and 1440px.

## Dates

- Any date-based page supports prev/next/any-date navigation via `?date=YYYY-MM-DD`.
- Past days are editable, not read-only.

## Data integrity

- Manual input always wins over AI-extracted or synced values.
- Never change streak or adherence formulas without explicit sign-off.
- No backend or API contract changes unless the user has explicitly approved them first.
- Sensitive data (health, cycle, money) is never logged to the console, and the local cache
  is cleared on logout.

## Process

For each page/feature:

1. Show 2 static mockups (412px, dark theme) and wait for the user to pick one before writing
   real implementation code.
2. Use the user's real-data scale when building and testing (not a handful of placeholder
   rows) — their actual routine/task/medication counts, so density and scroll length are
   representative.
3. Dev server on port 5173 with `--strictPort`.
4. Verify against the real dev backend with a disposable test account, cleaned up afterward.
5. One commit per page.
6. Stop and tell the user exactly what to review — don't continue to further unrequested
   work.
