import { PartyPopper } from "lucide-react";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { mutedText, sectionLabel } from "./ui";

export interface NextUpItem {
  label: string;
  sublabel?: string;
  domain: "task" | "routine" | "medication";
  actionLabel: string;
  onAction: () => void;
  pending: boolean;
}

const DOMAIN_ACCENT: Record<NextUpItem["domain"], string> = {
  task: "border-l-bloom",
  routine: "border-l-routine",
  medication: "border-l-medication",
};

export function TodayNextUp({ item }: { item: NextUpItem | null }) {
  if (!item) {
    return (
      <Card className="flex items-center gap-3">
        <Icon icon={PartyPopper} size={22} className="text-success" />
        <div>
          <p className="text-sm font-medium text-ink dark:text-paper">All caught up</p>
          <p className={mutedText}>Nothing urgent left for today.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`border-l-4 ${DOMAIN_ACCENT[item.domain]}`}>
      <p className={`mb-1 ${sectionLabel}`}>Next up</p>
      <p className="text-sm font-medium text-ink dark:text-paper">{item.label}</p>
      {item.sublabel && <p className={mutedText}>{item.sublabel}</p>}
      <button
        type="button"
        disabled={item.pending}
        onClick={item.onAction}
        className="mt-2 rounded-full bg-bloom px-4 py-1.5 text-sm font-medium text-paper-card transition-colors hover:bg-bloom-light disabled:opacity-50"
      >
        {item.actionLabel}
      </button>
    </Card>
  );
}
