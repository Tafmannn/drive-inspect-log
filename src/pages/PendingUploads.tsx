// src/pages/PendingUploads.tsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

import {
  getAllPendingUploads,
  retryUpload,
  retryAllPending,
  deletePendingUpload,
  type PendingUpload,
} from "@/lib/pendingUploads";

import {
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Info,
} from "lucide-react";

type PendingUploadWithJob = PendingUpload & {
  jobNumber?: string | null;
  vehicleReg?: string | null;
};

const statusIcon = (status: string) => {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4 text-warning" />;
    case "uploading":
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <CheckCircle className="h-4 w-4 text-success" />;
  }
};

export const PendingUploads = () => {
  const navigate = useNavigate();

  const [uploads, setUploads] = useState<PendingUploadWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const items = await getAllPendingUploads();
    setUploads(items as PendingUploadWithJob[]);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    const ok = await retryUpload(id);
    if (ok) {
      toast({ title: "Upload succeeded" });
    } else {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    await refresh();
    setRetrying(null);
  };

  const handleRetryAll = async () => {
    setRetryingAll(true);
    const { succeeded, failed } = await retryAllPending();
    toast({
      title: "Retry complete",
      description: `${succeeded} succeeded, ${failed} failed.`,
    });
    await refresh();
    setRetryingAll(false);
  };

  const handleClear = async (u: PendingUploadWithJob) => {
    setClearing(u.id);
    await deletePendingUpload(u.id);
    toast({ title: "Removed from queue" });
    await refresh();
    setClearing(null);
  };

  const grouped = useMemo(() => {
    const byJob: Record<
      string,
      {
        key: string;
        jobNumber?: string | null;
        vehicleReg?: string | null;
        items: PendingUploadWithJob[];
      }
    > = {};

    for (const u of uploads) {
      const key =
        (u.jobNumber || u.vehicleReg || u.jobId || "unknown") as string;
      if (!byJob[key]) {
        byJob[key] = {
          key,
          jobNumber: u.jobNumber,
          vehicleReg: u.vehicleReg,
          items: [],
        };
      }
      byJob[key].items.push(u);
    }

    return Object.values(byJob);
  }, [uploads]);

  const totalPending = uploads.length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="Pending Uploads"
        showBack
        onBack={() => navigate(-1)}
      />

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Info banner */}
        <Card className="p-3 flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              When signal is weak, Axentra stores inspection photos locally and
              retries them when you&apos;re back online.
            </p>
            <p>
              Use <strong>Retry</strong> on individual items or{" "}
              <strong>Retry All</strong> to push everything again.
            </p>
          </div>
        </Card>

        {totalPending > 0 && (
          <Button
            onClick={handleRetryAll}
            disabled={retryingAll}
            className="w-full"
          >
            {retryingAll ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Retry All ({totalPending})
          </Button>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!loading && totalPending === 0 && (
          <p className="text-center py-12 text-muted-foreground">
            No pending uploads. All photos are synced.
          </p>
        )}

        {!loading &&
          grouped.map((group) => {
            const first = group.items[0];
            const jobLabel =
              group.jobNumber && group.vehicleReg
                ? `${group.jobNumber} – ${group.vehicleReg}`
                : group.jobNumber || group.vehicleReg || "Unknown job";

            const pickupCount = group.items.filter(
              (u) => u.inspectionType === "pickup"
            ).length;
            const deliveryCount = group.items.filter(
              (u) => u.inspectionType === "delivery"
            ).length;

            return (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex flex-col">
                    <p className="text-sm font-semibold">{jobLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      Pickup: {pickupCount} · Delivery: {deliveryCount}
                    </p>
                  </div>
                  {first.jobId && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => navigate(`/jobs/${first.jobId}`)}
                    >
                      View job
                    </Button>
                  )}
                </div>

                {group.items.map((u) => (
                  <Card
                    key={u.id}
                    className="p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {statusIcon(u.status)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {u.photoType}
                          {u.label ? ` – ${u.label}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {u.inspectionType} ·{" "}
                          {new Date(u.createdAt).toLocaleString()}
                        </p>
                        {u.errorMessage && (
                          <p className="text-xs text-destructive">
                            {u.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          u.status === "failed" ? "destructive" : "secondary"
                        }
                        className="capitalize"
                      >
                        {u.status}
                      </Badge>
                      {(u.status === "pending" || u.status === "failed") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(u.id)}
                          disabled={retrying === u.id}
                        >
                          {retrying === u.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleClear(u)}
                        disabled={clearing === u.id}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default PendingUploads;