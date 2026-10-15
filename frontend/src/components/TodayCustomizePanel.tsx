import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { MODULE_LABELS, type TodayModuleConfig } from "../lib/todayModules";
import { BottomSheet } from "./BottomSheet";
import { Icon } from "./Icon";
import { Toggle } from "./Toggle";
import { secondaryButton } from "./ui";

export function TodayCustomizePanel({
  open,
  onClose,
  modules,
  onToggleVisible,
  onMove,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  modules: TodayModuleConfig[];
  onToggleVisible: (id: TodayModuleConfig["id"]) => void;
  onMove: (id: TodayModuleConfig["id"], direction: "up" | "down") => void;
  onReset: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Customize Today">
      <ul className="flex flex-col gap-1">
        {modules.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2 py-1.5">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => onMove(m.id, "up")}
                aria-label={`Move ${MODULE_LABELS[m.id]} up`}
                className="flex h-6 w-6 items-center justify-center rounded text-ink-muted disabled:opacity-30 dark:text-mist-muted"
              >
                <Icon icon={ChevronUp} size={14} />
              </button>
              <button
                type="button"
                disabled={i === modules.length - 1}
                onClick={() => onMove(m.id, "down")}
                aria-label={`Move ${MODULE_LABELS[m.id]} down`}
                className="flex h-6 w-6 items-center justify-center rounded text-ink-muted disabled:opacity-30 dark:text-mist-muted"
              >
                <Icon icon={ChevronDown} size={14} />
              </button>
            </div>
            <span className={`flex-1 text-sm ${m.visible ? "text-ink dark:text-paper" : "text-ink-muted dark:text-mist-muted"}`}>
              {MODULE_LABELS[m.id]}
            </span>
            <Toggle checked={m.visible} onChange={() => onToggleVisible(m.id)} label={`Show ${MODULE_LABELS[m.id]}`} />
          </li>
        ))}
      </ul>
      <button type="button" onClick={onReset} className={`mt-4 inline-flex items-center gap-1.5 ${secondaryButton}`}>
        <Icon icon={RotateCcw} size={14} />
        Reset to default
      </button>
    </BottomSheet>
  );
}
