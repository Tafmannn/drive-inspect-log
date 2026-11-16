import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Shown to drivers who reach a completed job's detail or POD page
 * (direct link, history, bookmark). Completed jobs are record-only
 * for drivers.
 */
export const DriverJobLocked = ({ title }: { title: string }) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title={title} showBack onBack={() => navigate("/jobs/completed")} />
      <div className="p-4 flex flex-col items-center text-center gap-3 py-16">
        <Lock className="w-10 h-10 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Job completed</p>
          <p className="text-[13px] text-muted-foreground max-w-xs">
            This job has been signed off and is no longer available to view.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-[44px] rounded-lg mt-2"
          onClick={() => navigate("/jobs/completed")}
        >
          Back to Last 14 Days
        </Button>
      </div>
      <BottomNav />
    </div>
  );
};
