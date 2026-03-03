import { useState } from "react";
import { Button } from "@/components/ui/button";
import { promoteToAdmin } from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

interface PromoteAdminButtonProps {
  email: string;
  orgId?: string;
  currentRole?: string;
  onPromoted?: () => void;
}

export function PromoteAdminButton({
  email,
  orgId,
  currentRole,
  onPromoted,
}: PromoteAdminButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (currentRole === "admin" || currentRole === "super_admin") {
    return (
      <span className="text-xs text-muted-foreground italic">Already admin</span>
    );
  }

  const handleClick = async () => {
    setLoading(true);
    try {
      await promoteToAdmin(email, orgId);
      toast({ title: "User promoted to admin" });
      onPromoted?.();
    } catch (err) {
      toast({
        title: "Promotion failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" onClick={handleClick} disabled={loading}>
      {loading ? "Promoting…" : "Promote to Admin"}
    </Button>
  );
}
