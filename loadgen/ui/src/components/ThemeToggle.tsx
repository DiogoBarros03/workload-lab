import { Monitor, Moon, Sun } from "@phosphor-icons/react";
import { nextTheme, type Theme } from "@/hooks/use-theme";

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const LABELS: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };

// Shows the current choice; each press moves to the next one.
export function ThemeToggle({ theme, onCycle, showLabel = false }: { theme: Theme; onCycle: () => void; showLabel?: boolean }) {
  const Icon = ICONS[theme];
  return (
    <button
      type="button" onClick={onCycle}
      aria-label={`Theme: ${theme}, switch to ${nextTheme(theme)}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-label text-muted-foreground outline-none hover:bg-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon weight="bold" aria-hidden className="size-4 shrink-0" />
      {showLabel && <span>{LABELS[theme]}</span>}
    </button>
  );
}
