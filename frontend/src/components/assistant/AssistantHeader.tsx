import { History, SquarePen } from "lucide-react";
import { IconButton } from "../IconButton";

export function AssistantHeader({
  onNewChat,
  onOpenHistory,
}: {
  onNewChat: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-stone px-2 py-1 dark:border-stone-dark">
      <div className="mx-auto flex max-w-[720px] items-center justify-between">
        <span className="px-2 font-display text-lg font-semibold text-ink dark:text-paper">Assistant</span>
        <div className="flex items-center">
          <IconButton icon={SquarePen} label="New chat" onClick={onNewChat} />
          <IconButton icon={History} label="Conversation history" onClick={onOpenHistory} />
        </div>
      </div>
    </div>
  );
}
