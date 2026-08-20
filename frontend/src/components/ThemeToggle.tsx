import { useTheme, type Theme } from "../hooks/useTheme";
import { card, pillButton, pillButtonInactive, sectionLabel } from "./ui";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();

  return (
    <div className={card}>
      <h2 className={`mb-3 ${sectionLabel}`}>Appearance</h2>
      <div className="flex gap-1.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={`${pillButton} px-3 py-1 ${
              theme === opt.value
                ? "border-bloom bg-bloom text-paper-card"
                : pillButtonInactive
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
