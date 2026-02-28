import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { getAllPendingUploads, retryUpload, retryAllPending, pruneDone, type PendingUpload } from "@/lib/pendingUploads";
import { Loader2, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export const PendingUploads = () => {
  const navigate = useNavigate();
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const refresh = async () => {
    setLoading(true);
    pruneDone(); // Clean up completed items from localStorage
    const items = await getAllPendingUploads();
    // Only show actionable items (pending/failed), not completed ones
    setUploads(items.filter(i => i.status === 'pending' || i.status === 'failed'));
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    const ok = await retryUpload(id);
    if (ok) toast({ title: "Upload complete." });
    else toast({ title: "Upload failed. Tap to retry.", variant: "destructive" });
    await refresh();
    setRetrying(null);
  };

  const handleRetryAll = async () => {
    setRetryingAll(true);
    const { succeeded, failed } = await retryAllPending();
    toast({ title: failed > 0 ? "Some uploads failed. Please try again." : "All uploads complete." });
    await refresh();
    setRetryingAll(false);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-warning" />;
      case 'uploading': return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'done': return <CheckCircle className="h-4 w-4 text-success" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Pending Uploads" showBack onBack={() => navigate(-1)} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {uploads.length > 0 && (
          <Button onClick={handleRetryAll} disabled={retryingAll} className="w-full">
            {retryingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Retry All ({uploads.length})
          </Button>
        )}

        {loading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}

        {!loading && uploads.length === 0 && (
          <p className="text-center py-12 text-muted-foreground">No pending uploads. All photos are synced.</p>
        )}

        {uploads.map((u) => (
          <Card key={u.id} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {statusIcon(u.status)}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.photoType}{u.label ? ` – ${u.label}` : ''}</p>
                <p className="text-xs text-muted-foreground">{u.inspectionType} · {new Date(u.createdAt).toLocaleString()}</p>
                {u.errorMessage && <p className="text-xs text-destructive">{u.errorMessage}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={u.status === 'failed' ? 'destructive' : 'secondary'} className="capitalize">{u.status}</Badge>
              {(u.status === 'pending' || u.status === 'failed') && (
                <Button size="sm" variant="outline" onClick={() => handleRetry(u.id)} disabled={retrying === u.id}>
                  {retrying === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
