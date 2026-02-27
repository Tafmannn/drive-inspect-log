import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useJob } from "@/hooks/useJobs";
import { useJobExpenses } from "@/hooks/useExpenses";
import { Loader2, Phone, MapPin, Building, Edit, ClipboardCheck, Truck, FileText, Receipt, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { createQrConfirmation, getQrConfirmationsForJob, buildQrUrl, type QrConfirmation } from "@/lib/qrApi";
import { QrDisplayModal } from "@/components/QrDisplayModal";
import { useAuth } from "@/context/AuthContext";

const STATUS_LABELS: Record<string, string> = {
  ready_for_pickup: 'Ready for Pickup',
  pickup_in_progress: 'Pickup In Progress',
  pickup_complete: 'Pickup Complete',
  in_transit: 'In Transit',
  delivery_in_progress: 'Delivery In Progress',
  delivery_complete: 'Delivery Complete',
  pod_ready: 'POD Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const JobDetail = () => {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const { data: job, isLoading } = useJob(jobId ?? '');
  const { data: jobExpenses } = useJobExpenses(jobId ?? '');
  const { isAdmin } = useAuth();
  const expenseTotal = jobExpenses?.reduce((sum, e) => sum + Number(e.amount), 0) ?? 0;

  const [qrConfirmations, setQrConfirmations] = useState<QrConfirmation[]>([]);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [qrModal, setQrModal] = useState<{ open: boolean; url: string; eventType: string }>({ open: false, url: '', eventType: '' });

  useEffect(() => {
    if (!jobId) return;
    getQrConfirmationsForJob(jobId).then(setQrConfirmations).catch(() => {});
  }, [jobId]);

  const handleGenerateQr = async (eventType: "collection" | "delivery") => {
    if (!jobId) return;
    setGeneratingQr(true);
    try {
      const qr = await createQrConfirmation(jobId, eventType);
      setQrConfirmations(prev => [qr, ...prev]);
      const url = buildQrUrl(qr.token);
      // Always show QR modal — never rely on clipboard alone
      setQrModal({ open: true, url, eventType });
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setGeneratingQr(false);
    }
  };

  if (isLoading || !job) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Job Detail" showBack onBack={() => navigate('/jobs')} />
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  const pickupInspection = job.inspections.find((i) => i.type === 'pickup');
  const deliveryInspection = job.inspections.find((i) => i.type === 'delivery');
  const jobRef = job.external_job_number || job.id.slice(0, 8);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title={job.vehicle_reg} showBack onBack={() => navigate('/jobs')} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Vehicle header */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <Badge className="bg-warning text-warning-foreground font-bold px-3 py-1">{job.vehicle_reg}</Badge>
            <Badge variant="outline">{STATUS_LABELS[job.status] ?? job.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{job.vehicle_make} {job.vehicle_model} — {job.vehicle_colour}</p>
          {job.external_job_number && <p className="text-xs text-muted-foreground mt-1">Ref: {job.external_job_number}</p>}
          <p className="text-sm font-medium mt-2">{job.pickup_city} → {job.delivery_city}</p>
          {(job as any).route_distance_miles != null && (
            <p className="text-xs text-muted-foreground mt-1">
              📏 {(job as any).route_distance_miles} mi • 🕐 {(job as any).route_eta_minutes} min
            </p>
          )}
        </Card>

        {/* Pickup */}
        <Card className="p-4 space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">Pickup</h3>
          <div className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{job.pickup_contact_name}</span></div>
          <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{job.pickup_contact_phone}</span></div>
          <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" /><span className="text-sm">{[job.pickup_address_line1, job.pickup_city, job.pickup_postcode].join(', ')}</span></div>
        </Card>

        {/* Delivery */}
        <Card className="p-4 space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">Delivery</h3>
          <div className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{job.delivery_contact_name}</span></div>
          <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{job.delivery_contact_phone}</span></div>
          <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" /><span className="text-sm">{[job.delivery_address_line1, job.delivery_city, job.delivery_postcode].join(', ')}</span></div>
        </Card>

        {/* Inspections */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Inspections</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm">Pickup Inspection</span>
            {pickupInspection ? (
              <Badge className="bg-success text-success-foreground">Complete</Badge>
            ) : (
              <Button size="sm" onClick={() => navigate(`/inspection/${job.id}/pickup`)}>
                <ClipboardCheck className="h-4 w-4 mr-1" /> Start
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Delivery Inspection</span>
            {deliveryInspection ? (
              <Badge className="bg-success text-success-foreground">Complete</Badge>
            ) : (
              <Button size="sm" onClick={() => navigate(`/inspection/${job.id}/delivery`)}>
                <Truck className="h-4 w-4 mr-1" /> Start
              </Button>
            )}
          </div>
        </Card>

        {/* QR Handover Confirmations */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <QrCode className="h-4 w-4 text-muted-foreground" /> QR Handover
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleGenerateQr("collection")} disabled={generatingQr}>
              Collection QR
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleGenerateQr("delivery")} disabled={generatingQr}>
              Delivery QR
            </Button>
          </div>
          {qrConfirmations.length > 0 && (
            <div className="space-y-1">
              {qrConfirmations.map(qr => (
                <div key={qr.id} className="flex justify-between text-xs py-1">
                  <span className="text-muted-foreground capitalize">{qr.event_type}</span>
                  {qr.confirmed_at ? (
                    <Badge className="bg-success text-success-foreground text-[10px]">
                      ✓ {qr.customer_name} – {new Date(qr.confirmed_at).toLocaleString("en-GB")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Pending</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Expenses */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" /> Expenses
            </h3>
            <Badge variant="outline">{jobExpenses?.length ?? 0} – £{expenseTotal.toFixed(2)}</Badge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(`/expenses?jobId=${job.id}`)}>View Expenses</Button>
            <Button size="sm" onClick={() => navigate(`/expenses/new?jobId=${job.id}`)}>Add Expense</Button>
          </div>
        </Card>

        {/* Activity */}
        {job.activity_log.length > 0 && (
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-sm">Activity</h3>
            {job.activity_log.map((log) => (
              <div key={log.id} className="text-xs text-muted-foreground">
                <span className="font-medium">{log.action}</span> — {new Date(log.created_at).toLocaleString()}
              </div>
            ))}
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {isAdmin && (
            <Button variant="outline" className="w-full" onClick={() => navigate(`/jobs/${job.id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" /> Edit Job
            </Button>
          )}
          {(job.has_pickup_inspection || job.has_delivery_inspection) && (
            <Button className="w-full" onClick={() => navigate(`/jobs/${job.id}/pod`)}>
              <FileText className="h-4 w-4 mr-2" /> View POD Report
            </Button>
          )}
        </div>
      </div>

      {/* QR Display Modal */}
      <QrDisplayModal
        isOpen={qrModal.open}
        onClose={() => setQrModal(prev => ({ ...prev, open: false }))}
        url={qrModal.url}
        eventType={qrModal.eventType}
        jobRef={jobRef}
      />
    </div>
  );
};
