import { mutedText } from "./ui";

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-10 text-center">
      {icon && <span className="text-3xl">{icon}</span>}
      <p className="text-sm font-medium text-ink dark:text-paper">{title}</p>
      {hint && <p className={mutedText}>{hint}</p>}
    </div>
  );
}
