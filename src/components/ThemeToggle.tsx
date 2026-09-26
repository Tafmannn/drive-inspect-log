import { useEffect, useState } from "react";
import { Sun, Moon, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useThemeMode } from "@/hooks/useThemeMode";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "auto", label: "Auto", icon: Clock },
] as const;

/**
 * Three-way appearance switch (Light / Dark / Auto) shown on the Profile
 * screen. Auto switches by local time of day (see useThemeMode), not the
 * device's OS setting. Persisted under "axentra-theme-mode" in localStorage.
 */
export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  // The mode is read from localStorage synchronously, but we still gate the
  // highlighted state on mount to avoid any hydration/flash mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-medium">Appearance</p>
        <div
          role="radiogroup"
          aria-label="Appearance"
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = mounted && mode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(value)}
                className={cn(
                  "flex min-h-[40px] items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground active:bg-background/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
        {mode === "auto" && (
          <p className="text-xs text-muted-foreground">
            Light during the day, dark in the evening — based on your
            device's clock.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
