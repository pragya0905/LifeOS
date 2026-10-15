import { useEffect, useState } from "react";
import { motionAllowed } from "../lib/preferences";
import { playCelebrationChime } from "../lib/sound";

const PARTICLE_COLORS = ["var(--color-bloom)", "var(--color-success)", "var(--color-amber)", "var(--color-routine)", "var(--color-medication)"];
const PARTICLE_COUNT = 14;

// A brief celebratory burst for "a whole routine done" / "all of today's meds taken" — pure
// CSS, no canvas/library. Animations and sound are independent Settings toggles, so the
// chime fires on its own regardless of whether the visual burst renders.
export function Celebration({ onDone }: { onDone: () => void }) {
  const [allowed] = useState(motionAllowed);

  useEffect(() => {
    playCelebrationChime();
    if (!allowed) {
      onDone();
      return;
    }
    const timer = setTimeout(onDone, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[70] flex justify-center" aria-hidden="true">
      <div className="relative h-0 w-0">
        {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
          const angle = (i / PARTICLE_COUNT) * 360;
          const distance = 60 + (i % 3) * 20;
          return (
            <span
              key={i}
              className="absolute h-2 w-2 rounded-sm"
              style={{
                backgroundColor: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
                animation: `celebrate-burst 700ms var(--ease-standard) both`,
                // @ts-expect-error -- custom properties read by the keyframe below
                "--angle": `${angle}deg`,
                "--distance": `${distance}px`,
              }}
            />
          );
        })}
      </div>
      <style>{`
        @keyframes celebrate-burst {
          from { transform: rotate(var(--angle)) translateY(0) scale(1); opacity: 1; }
          to { transform: rotate(var(--angle)) translateY(calc(var(--distance) * -1)) scale(0.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
