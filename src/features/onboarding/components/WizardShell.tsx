/**
 * WizardShell — reusable mobile-first onboarding wizard chrome.
 * Provides: header, step progress, body slot, and Back / Next / Save bar.
 */
import { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface WizardStepDef {
  id: number;
  title: string;
  desc?: string;
}

interface WizardShellProps {
  title: string;
  steps: WizardStepDef[];
  current: number; // 1-based
  onBack: () => void;
  onNext: () => void;
  saving?: boolean;
  isLast?: boolean;
  isFirst?: boolean;
  exitTo?: string;
  banner?: ReactNode;
  children: ReactNode;
  nextDisabled?: boolean;
  nextLabel?: string;
}

export function WizardShell({
  title, steps, current, onBack, onNext, saving,
  isLast, isFirst, exitTo, banner, children, nextDisabled, nextLabel,
}: WizardShellProps) {
  const navigate = useNavigate();
  const stepDef = steps.find(s => s.id === current);

  return (
    <div className="min-h-screen bg-background pb-28">
      <AppHeader title={title} />
      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        {exitTo && (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => navigate(exitTo)}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Exit
          </Button>
        )}

        {banner}

        {/* Step pills */}
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
          {steps.map((s) => {
            const done = s.id < current;
            const active = s.id === current;
            return (
              <div
                key={s.id}
                className={
                  "flex-1 min-w-[64px] rounded-full h-1.5 " +
                  (done ? "bg-primary" : active ? "bg-primary/70" : "bg-muted")
                }
              />
            );
          })}
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Step {current} of {steps.length}
          </p>
          <h1 className="text-lg font-semibold mt-0.5">{stepDef?.title}</h1>
          {stepDef?.desc && (
            <p className="text-sm text-muted-foreground mt-0.5">{stepDef.desc}</p>
          )}
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">{children}</CardContent>
        </Card>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border px-4 py-3 z-30">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1 min-h-[44px]"
            onClick={onBack}
            disabled={saving || isFirst}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button
            className="flex-1 min-h-[44px]"
            onClick={onNext}
            disabled={saving || nextDisabled}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : isLast ? (
              <CheckCircle2 className="w-4 h-4 mr-1" />
            ) : (
              <ArrowRight className="w-4 h-4 mr-1" />
            )}
            {nextLabel ?? (isLast ? "Finish" : "Next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
