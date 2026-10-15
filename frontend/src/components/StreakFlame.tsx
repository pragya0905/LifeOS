// The one hand-drawn icon kept outside the lucide/<Icon> system on purpose — the streak
// flame is the app's single recurring emotionally-loaded symbol, worth its own personality
// rather than a generic stroke icon. Filled with currentColor so it tints via className
// exactly like the lucide icons it sits alongside.
export function StreakFlame({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2.5c.6 2.4-.4 3.9-1.8 5.4C8.7 9.5 7 11.3 7 14.2a5 5 0 0 0 10 0c0-1.3-.4-2.2-.9-3 .1 1.6-.6 2.7-1.6 2.7-1.2 0-1.5-1-1.2-2 .5-1.7-.3-3.1-1.3-4.1.3 1.4-.2 2.3-1 3-.9.8-1.5 1.7-1.5 3 0 1.4.9 2.3 2 2.3"
        fill="currentColor"
      />
    </svg>
  );
}
