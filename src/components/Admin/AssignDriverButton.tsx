import { useState } from "react";
import { Button } from "@/components/ui/button";
import { assignDriver } from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

interface AssignDriverButtonProps {
  email: string;
  orgId?: string;
  currentRole?: string;
  onAssigned?: () => void;
}

export function AssignDriverButton({
  email,
  orgId,
  currentRole,
  onAssigned,
}: AssignDriverButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (currentRole === "driver") {
    return (
      <span className="text-xs text-muted-foreground italic">Already driver</span>
    );
  }

  const handleClick = async () => {
    setLoading(true);
    try {
      await assignDriver(email, orgId);
      toast({ title: "User assigned as driver" });
      onAssigned?.();
    } catch (err) {
      toast({
        title: "Assignment failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={loading}>
      {loading ? "Assigning…" : "Set as Driver"}
    </Button>
  );
}
