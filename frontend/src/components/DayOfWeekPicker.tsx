import { DAY_LABELS } from "../lib/weekdays";
import { pillButton, pillButtonDone, pillButtonInactive } from "./ui";

// Module-level so React keeps element identity across re-renders — shared by Routines.tsx
// (daysOfWeek on a routine) and MealPlan.tsx (weekly meal plan defaults).
export default function DayOfWeekPicker({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (day: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAY_LABELS.map((label, day) => (
        <button
          key={day}
          type="button"
          onClick={() => onToggle(day)}
          className={`${pillButton} px-2.5 py-1 ${selected.includes(day) ? pillButtonDone : pillButtonInactive}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
