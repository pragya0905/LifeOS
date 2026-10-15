import { Link } from "react-router-dom";
import { NotebookPen } from "lucide-react";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { mutedText } from "./ui";

const EVENING_HOUR = 18;

export function TodayJournalPrompt({ journaledToday }: { journaledToday: boolean }) {
  const isEvening = new Date().getHours() >= EVENING_HOUR;
  if (!isEvening || journaledToday) return null;

  return (
    <Card className="flex items-center gap-3">
      <Icon icon={NotebookPen} size={20} className="text-bloom" />
      <div className="flex-1">
        <p className="text-sm font-medium text-ink dark:text-paper">How was today?</p>
        <p className={mutedText}>A quick journal entry — text or voice.</p>
      </div>
      <Link to="/journal" className="shrink-0 rounded-full border border-stone px-3.5 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-stone/40 dark:border-stone-dark dark:text-paper dark:hover:bg-stone-dark/40">
        Write
      </Link>
    </Card>
  );
}
