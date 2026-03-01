import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RotateCcw, HardDrive } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  pruneDone,
  getPendingUploadsByJob,
  retryJobUploads,
  type JobUploadSummary,
} from "@/lib/pendingUploads";

export function AdminPendingUploads() {
  const [groups, setGroups] = useState<JobUploadSummary[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    pruneDone();
    setGroups(getPendingUploadsByJob());
  }, []);

  const handleRetry = async (jobId: string) => {
    setRetrying(jobId);
    try {
      const result = await retryJobUploads(jobId);
      toast({
        title: result.failed > 0
          ? `${result.succeeded} uploaded, ${result.failed} still failing.`
          : `${result.succeeded} photo(s) uploaded successfully.`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      pruneDone();
      setGroups(getPendingUploadsByJob());
    } catch {
      toast({ title: "Retry failed.", variant: "destructive" });
    } finally {
      setRetrying(null);
    }
  };

  if (!groups.length) {
    return (
      <div className="text-center py-8 space-y-2">
        <HardDrive className="w-10 h-10 mx-auto text-muted-foreground stroke-[2]" />
        <p className="text-[14px] text-muted-foreground">No pending uploads on this device.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[13px]">Job</TableHead>
              <TableHead className="text-[13px]">Reg</TableHead>
              <TableHead className="text-[13px]">Pending</TableHead>
              <TableHead className="text-[13px]">Failed</TableHead>
              <TableHead className="text-[13px]">Last Error</TableHead>
              <TableHead className="text-[13px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.jobId}>
                <TableCell className="text-[14px] font-medium">
                  {g.jobNumber || g.jobId.slice(0, 8)}
                </TableCell>
                <TableCell className="text-[14px]">{g.vehicleReg || "—"}</TableCell>
                <TableCell className="text-[14px]">{g.pendingCount}</TableCell>
                <TableCell className="text-[14px] text-destructive">{g.failedCount}</TableCell>
                <TableCell className="text-[13px] text-muted-foreground">
                  {g.lastErrorAt ? new Date(g.lastErrorAt).toLocaleString() : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retrying === g.jobId}
                    onClick={() => handleRetry(g.jobId)}
                    className="min-h-[44px] rounded-lg"
                  >
                    {retrying === g.jobId ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="w-4 h-4 mr-1" />
                    )}
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[12px] text-muted-foreground text-center">
        This data is stored offline on this device.
      </p>
    </div>
  );
}
