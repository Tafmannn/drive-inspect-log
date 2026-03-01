import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { useJob } from "@/hooks/useJobs";
import { useJobExpenses } from "@/hooks/useExpenses";
import { Phone, MapPin, Building, Edit, ClipboardCheck, Truck, FileText, Receipt, QrCode, User } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    } catch {
      toast({ title: "QR generation failed. Please try again.", variant: "destructive" });
    } finally {
      setGeneratingQr(false);
    }
  };

  if (isLoading || !job) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <AppHeader title="Job Detail" showBack onBack={() => navigate('/jobs')} />
        <div className="p-4"><DashboardSkeleton /></div>
        <BottomNav />
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
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title={`Job ${jobRef}`} showBack onBack={() => navigate('/jobs')} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Vehicle header */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <UKPlate reg={job.vehicle_reg} />
            <span
              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold uppercase leading-none"
            >
              {statusStyle.label}
            </span>
          </div>
          <p className="text-[16px] font-medium text-primary">Job {jobRef}</p>
          <p className="text-[14px] text-muted-foreground">{job.vehicle_make} {job.vehicle_model} — {job.vehicle_colour}</p>
          <p className="text-[16px] font-medium text-foreground">{job.pickup_city} → {job.delivery_city}</p>
          {job.route_distance_miles != null && (
            <p className="text-[13px] text-muted-foreground">
              📏 {job.route_distance_miles} mi • 🕐 {job.route_eta_minutes} min
            </p>
          )}
        </div>

        {/* Client */}
        {job.client_name && (
          <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-2">
            <h3 className="text-[14px] font-semibold text-muted-foreground flex items-center gap-1.5">
              <User className="w-4 h-4" /> Client
            </h3>
            <p className="text-[16px] font-medium text-foreground">{job.client_name}</p>
            {job.client_company && <p className="text-[13px] text-muted-foreground">{job.client_company}</p>}
            {job.client_phone && (
              <a href={`tel:${job.client_phone}`} className="text-[14px] text-primary flex items-center gap-1.5 hover:underline min-h-[44px]">
                <Phone className="w-4 h-4" /> {job.client_phone}
              </a>
            )}
            {job.client_email && <p className="text-[13px] text-muted-foreground">{job.client_email}</p>}
            {job.client_notes && <p className="text-[13px] text-muted-foreground italic">{job.client_notes}</p>}
          </div>
        )}

        {/* Pickup */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-2">
          <h3 className="text-[14px] font-semibold text-muted-foreground">Pickup</h3>
          <div className="flex items-center gap-2 min-h-[44px]">
            <Building className="w-4 h-4 text-muted-foreground" />
            <span className="text-[14px] text-foreground">{job.pickup_contact_name}</span>
          </div>
          <div className="flex items-center gap-2 min-h-[44px]">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <a href={`tel:${job.pickup_contact_phone}`} className="text-[14px] text-primary hover:underline">{job.pickup_contact_phone}</a>
          </div>
          <div className="flex items-start gap-2 min-h-[44px]">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
            <a href={mapsUrl(pickupAddress)} target="_blank" rel="noopener noreferrer" className="text-[14px] text-primary hover:underline">{pickupAddress}</a>
          </div>
          {job.pickup_notes && <p className="text-[13px] text-muted-foreground italic">📝 {job.pickup_notes}</p>}
        </div>

        {/* Delivery */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-2">
          <h3 className="text-[14px] font-semibold text-muted-foreground">Delivery</h3>
          <div className="flex items-center gap-2 min-h-[44px]">
            <Building className="w-4 h-4 text-muted-foreground" />
            <span className="text-[14px] text-foreground">{job.delivery_contact_name}</span>
          </div>
          <div className="flex items-center gap-2 min-h-[44px]">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <a href={`tel:${job.delivery_contact_phone}`} className="text-[14px] text-primary hover:underline">{job.delivery_contact_phone}</a>
          </div>
          <div className="flex items-start gap-2 min-h-[44px]">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
            <a href={mapsUrl(deliveryAddress)} target="_blank" rel="noopener noreferrer" className="text-[14px] text-primary hover:underline">{deliveryAddress}</a>
          </div>
          {job.delivery_notes && <p className="text-[13px] text-muted-foreground italic">📝 {job.delivery_notes}</p>}
        </div>

        {/* Inspections */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-3">
          <h3 className="text-[16px] font-medium text-foreground">Inspections</h3>
          <div className="flex items-center justify-between min-h-[44px]">
            <span className="text-[14px] text-foreground">Pickup Inspection</span>
            {pickupInspection ? (
              <span style={{ backgroundColor: getStatusStyle('completed').backgroundColor, color: getStatusStyle('completed').color }} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold uppercase leading-none">Complete</span>
            ) : (
              <Button size="sm" onClick={() => navigate(`/inspection/${job.id}/pickup`)} className="min-h-[44px] rounded-lg">
                <ClipboardCheck className="w-4 h-4 mr-1" /> Start
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between min-h-[44px]">
            <span className="text-[14px] text-foreground">Delivery Inspection</span>
            {deliveryInspection ? (
              <span style={{ backgroundColor: getStatusStyle('completed').backgroundColor, color: getStatusStyle('completed').color }} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold uppercase leading-none">Complete</span>
            ) : (
              <Button size="sm" onClick={() => navigate(`/inspection/${job.id}/delivery`)} className="min-h-[44px] rounded-lg">
                <Truck className="w-4 h-4 mr-1" /> Start
              </Button>
            )}
          </div>
        </div>

        {/* QR Handover */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-3">
          <h3 className="text-[14px] font-semibold text-muted-foreground flex items-center gap-2">
            <QrCode className="w-4 h-4" /> QR Handover
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleGenerateQr("collection")} disabled={generatingQr} className="min-h-[44px] rounded-lg">
              Collection QR
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleGenerateQr("delivery")} disabled={generatingQr} className="min-h-[44px] rounded-lg">
              Delivery QR
            </Button>
          </div>
          {qrConfirmations.length > 0 && (
            <div className="space-y-1">
              {qrConfirmations.map(qr => (
                <div key={qr.id} className="flex justify-between text-[13px] py-1">
                  <span className="text-muted-foreground capitalize">{qr.event_type}</span>
                  {qr.confirmed_at ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-semibold leading-none bg-success text-success-foreground">
                      ✓ {qr.customer_name} – {new Date(qr.confirmed_at).toLocaleString("en-GB")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-semibold leading-none border border-border text-muted-foreground">Pending</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expenses */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-muted-foreground flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Expenses
            </h3>
            <span className="text-[13px] text-muted-foreground">{jobExpenses?.length ?? 0} items</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(`/expenses?jobId=${job.id}`)} className="min-h-[44px] rounded-lg">View Expenses</Button>
            <Button size="sm" onClick={() => navigate(`/expenses/new?jobId=${job.id}`)} className="min-h-[44px] rounded-lg">Add Expense</Button>
          </div>
        </div>

        {/* Activity */}
        {job.activity_log.length > 0 && (
          <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-2">
            <h3 className="text-[14px] font-semibold text-muted-foreground">Activity</h3>
            {job.activity_log.map((log) => (
              <div key={log.id} className="text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground">{log.action}</span> — {new Date(log.created_at).toLocaleString()}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3 pb-4">
          {isAdmin && (
            <Button variant="outline" className="w-full min-h-[44px] rounded-lg" onClick={() => navigate(`/jobs/${job.id}/edit`)}>
              <Edit className="w-4 h-4 mr-2" /> Edit Job
            </Button>
          )}
          {(job.has_pickup_inspection || job.has_delivery_inspection) && (
            <Button className="w-full min-h-[44px] rounded-lg" onClick={() => navigate(`/jobs/${job.id}/pod`)}>
              <FileText className="w-4 h-4 mr-2" /> View POD Report
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
      <BottomNav />
    </div>
  );
};
