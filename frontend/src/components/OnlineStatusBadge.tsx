import { useOnlineStatus } from "../hooks/useOnlineStatus";

export default function OnlineStatusBadge() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <span
      role="status"
      className="flex items-center gap-1.5 rounded-full bg-alert-soft px-2.5 py-1 text-xs font-medium text-alert dark:bg-alert-soft-dark dark:text-alert-light"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-alert" />
      Offline
    </span>
  );
}
