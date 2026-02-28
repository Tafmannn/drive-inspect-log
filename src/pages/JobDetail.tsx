import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useJob } from "@/hooks/useJobs";
import { useJobExpenses } from "@/hooks/useExpenses";
import { Loader2, Phone, MapPin, Building, Edit, ClipboardCheck, Truck, FileText, Receipt, QrCode, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { createQrConfirmation, getQrConfirmationsForJob, buildQrUrl, type QrConfirmation } from "@/lib/qrApi";
import { QrDisplayModal } from "@/components/QrDisplayModal";
import { useAuth } from "@/context/AuthContext";
import { getStatusStyle } from "@/lib/statusConfig";
import { UKPlate } from "@/components/UKPlate";

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

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
  const statusStyle = getStatusStyle(job.status);

  const pickupAddress = [job.pickup_address_line1, job.pickup_city, job.pickup_postcode].filter(Boolean).join(', ');
  const deliveryAddress = [job.delivery_address_line1, job.delivery_city, job.delivery_postcode].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title={`Job ${jobRef}`} showBack onBack={() => navigate('/jobs')} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Vehicle header */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <UKPlate reg={job.vehicle_reg} />
            <span
              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase leading-none"
            >
              {statusStyle.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-primary mt-1">Job {jobRef}</p>
          <p className="text-sm text-muted-foreground">{job.vehicle_make} {job.vehicle_model} — {job.vehicle_colour}</p>
          <p className="text-sm font-medium mt-2">{job.pickup_city} → {job.delivery_city}</p>
          {job.route_distance_miles != null && (
            <p className="text-xs text-muted-foreground mt-1">
              📏 {job.route_distance_miles} mi • 🕐 {job.route_eta_minutes} min
            </p>
          )}
        </Card>

        {/* Client info (if present) */}
        {job.client_name && (
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1.5">
              <User className="h-4 w-4" /> Client
            </h3>
            <p className="text-sm font-medium">{job.client_name}</p>
            {job.client_company && <p className="text-xs text-muted-foreground">{job.client_company}</p>}
            {job.client_phone && (
              <a href={`tel:${job.client_phone}`} className="text-sm text-primary flex items-center gap-1.5 hover:underline">
                <Phone className="h-3.5 w-3.5" /> {job.client_phone}
              </a>
            )}
            {job.client_email && <p className="text-xs text-muted-foreground">{job.client_email}</p>}
            {job.client_notes && <p className="text-xs text-muted-foreground italic">{job.client_notes}</p>}
          </Card>
        )}

        {/* Pickup */}
        <Card className="p-4 space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">Pickup</h3>
          <div className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{job.pickup_contact_name}</span></div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${job.pickup_contact_phone}`} className="text-sm text-primary hover:underline">{job.pickup_contact_phone}</a>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <a href={mapsUrl(pickupAddress)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{pickupAddress}</a>
          </div>
          {job.pickup_notes && <p className="text-xs text-muted-foreground mt-1 italic">📝 {job.pickup_notes}</p>}
        </Card>

        {/* Delivery */}
        <Card className="p-4 space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">Delivery</h3>
          <div className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{job.delivery_contact_name}</span></div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${job.delivery_contact_phone}`} className="text-sm text-primary hover:underline">{job.delivery_contact_phone}</a>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <a href={mapsUrl(deliveryAddress)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{deliveryAddress}</a>
          </div>
          {job.delivery_notes && <p className="text-xs text-muted-foreground mt-1 italic">📝 {job.delivery_notes}</p>}
        </Card>

        {/* Inspections */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Inspections</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm">Pickup Inspection</span>
            {pickupInspection ? (
              <span style={{ backgroundColor: getStatusStyle('completed').backgroundColor, color: getStatusStyle('completed').color }} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase leading-none">Complete</span>
            ) : (
              <Button size="sm" onClick={() => navigate(`/inspection/${job.id}/pickup`)}>
                <ClipboardCheck className="h-4 w-4 mr-1" /> Start
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Delivery Inspection</span>
            {deliveryInspection ? (
              <span style={{ backgroundColor: getStatusStyle('completed').backgroundColor, color: getStatusStyle('completed').color }} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase leading-none">Complete</span>
            ) : (
              <Button size="sm" onClick={() => navigate(`/inspection/${job.id}/delivery`)}>
                <Truck className="h-4 w-4 mr-1" /> Start
              </Button>
            )}
          </div>
        </Card>

        {/* QR Handover */}
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
                    <span style={{ backgroundColor: '#34C759', color: '#FFFFFF' }} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none">
                      ✓ {qr.customer_name} – {new Date(qr.confirmed_at).toLocaleString("en-GB")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none border border-border text-muted-foreground">Pending</span>
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
            <span className="text-xs text-muted-foreground">{jobExpenses?.length ?? 0} items</span>
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
        <div className="space-y-2 pb-4">
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
