import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
] as const;

/**
 * Three-way appearance switch (Light / Dark / follow-System) shown on the
 * Profile screen. Persisted by next-themes in localStorage under "theme".
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the real stored theme after mount; render the
  // segmented control unselected until then to avoid a wrong-highlight flash.
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
            const active = mounted && theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(value)}
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
      </CardContent>
    </Card>
  );
}
