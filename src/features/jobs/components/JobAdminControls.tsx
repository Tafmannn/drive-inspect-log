/**
 * JobAdminControls — admin-only action rail extracted from JobDetail.
 *
 * Pure presentational + local UI state (status select). All mutations are
 * passed in as props so the parent retains ownership of dialog/mutation
 * lifecycles. Render INSIDE <RoleScope admin> at the call site.
 *
 * Behaviour preserved 1:1 from JobDetail.tsx pre-extraction.
 */
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Edit, RefreshCw, Trash2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ADMIN_ALLOWED_TRANSITIONS } from "@/lib/statusConfig";
import { withFrom } from "@/lib/navigationUtils";

interface JobAdminControlsProps {
  jobId: string;
  jobStatus: string;
  onChangeStatus: (newStatus: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}

export function JobAdminControls({
  jobId,
  jobStatus,
  onChangeStatus,
  onDelete,
}: JobAdminControlsProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [changingStatus, setChangingStatus] = useState(false);

  const transitions = ADMIN_ALLOWED_TRANSITIONS[jobStatus] ?? [];

  const handleChangeStatus = async () => {
    if (!selectedStatus || changingStatus) return;
    setChangingStatus(true);
    try {
      await onChangeStatus(selectedStatus);
      setSelectedStatus("");
    } finally {
      setChangingStatus(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="w-full min-h-[44px] rounded-lg"
        onClick={() => navigate(withFrom(`/jobs/${jobId}/edit`, searchParams))}
      >
        <Edit className="h-4 w-4 mr-1.5" /> Edit Job
      </Button>

      {transitions.length > 0 && (
        <div className="flex gap-2">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="flex-1 min-h-[44px] rounded-lg">
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              {transitions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="min-h-[44px] min-w-[44px] rounded-lg"
            disabled={!selectedStatus || changingStatus}
            onClick={handleChangeStatus}
          >
            {changingStatus ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            className="w-full min-h-[44px] rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete Job
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the job and remove it from all active lists. This action can be undone by a super admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void onDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
