import { useTheme, type Theme } from "../hooks/useTheme";
import { Card } from "./Card";
import { SegmentedControl } from "./SegmentedControl";
import { sectionLabel } from "./ui";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();

  return (
    <Card>
      <h2 className={`mb-3 ${sectionLabel}`}>Appearance</h2>
      <SegmentedControl options={OPTIONS} value={theme} onChange={setTheme} />
    </Card>
  );
}
