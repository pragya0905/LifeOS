import { useState } from "react";
import {
  DEFAULT_EVENING_HOUR,
  loadAnimationsEnabled,
  loadEveningHour,
  loadSoundEnabled,
  saveAnimationsEnabled,
  saveEveningHour,
  saveSoundEnabled,
} from "../lib/preferences";
import { Card } from "./Card";
import { Select } from "./Select";
import { Toggle } from "./Toggle";
import { mutedText, sectionLabel } from "./ui";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

function formatHour(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

// No haptics/vibration anywhere in the app — these two toggles (plus the OS-level
// prefers-reduced-motion, which always wins) are the only motion/sound controls needed.
export default function TodayPreferences() {
  const [animations, setAnimations] = useState(loadAnimationsEnabled);
  const [sound, setSound] = useState(loadSoundEnabled);
  const [eveningHour, setEveningHour] = useState(loadEveningHour);

  return (
    <Card>
      <h2 className={`mb-3 ${sectionLabel}`}>Today screen</h2>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink dark:text-paper">Animations</p>
            <p className={mutedText}>Check marks, celebrations. Also respects your device's reduced-motion setting.</p>
          </div>
          <Toggle
            checked={animations}
            onChange={(v) => {
              setAnimations(v);
              saveAnimationsEnabled(v);
            }}
            label="Animations"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink dark:text-paper">Sound</p>
            <p className={mutedText}>A soft tone on celebrations. Off by default.</p>
          </div>
          <Toggle
            checked={sound}
            onChange={(v) => {
              setSound(v);
              saveSoundEnabled(v);
            }}
            label="Sound"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink dark:text-paper">"Log your day" reminder time</p>
            <p className={mutedText}>Shows from this time until water, mood, and cycle are logged. Default {formatHour(DEFAULT_EVENING_HOUR)}.</p>
          </div>
          <Select
            value={eveningHour}
            onChange={(e) => {
              const next = Number(e.target.value);
              setEveningHour(next);
              saveEveningHour(next);
            }}
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Card>
  );
}
