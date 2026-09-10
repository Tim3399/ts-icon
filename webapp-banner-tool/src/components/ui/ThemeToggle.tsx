import { THEME_LABELS, useTheme } from "../../theme/theme";
import Icon, { type IconName } from "./Icon";

const ICONS: Record<string, IconName> = {
  system: "monitor",
  light: "sun",
  dark: "moon",
};

// A three-state cycle (system -> light -> dark) rather than a binary switch:
// "follow the OS" is the default and has to remain reachable, otherwise the
// first tap on the toggle would silently opt the user out of it forever.
export default function ThemeToggle() {
  const { preference, cycle } = useTheme();
  const label = THEME_LABELS[preference];

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      onClick={cycle}
      title={`Appearance: ${label}`}
      aria-label={`Appearance: ${label}. Change appearance`}
    >
      <Icon name={ICONS[preference]} size={17} />
    </button>
  );
}
