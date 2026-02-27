import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useJob } from "@/hooks/useJobs";
import { useJobExpenses } from "@/hooks/useExpenses";
import { Loader2, Phone, MapPin, Building, Edit, ClipboardCheck, Truck, FileText, Receipt, QrCode, User, PoundSterling } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { createQrConfirmation, getQrConfirmationsForJob, buildQrUrl, type QrConfirmation } from "@/lib/qrApi";
import { QrDisplayModal } from "@/components/QrDisplayModal";
import { useAuth } from "@/context/AuthContext";
import { getStatusConfig, getStatusBadgeClasses } from "@/lib/statusConfig";

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
  const statusCfg = getStatusConfig(job.status);
  const statusClasses = getStatusBadgeClasses(job.status);

  const pickupAddress = [job.pickup_address_line1, job.pickup_city, job.pickup_postcode].filter(Boolean).join(', ');
  const deliveryAddress = [job.delivery_address_line1, job.delivery_city, job.delivery_postcode].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title={job.vehicle_reg} showBack onBack={() => navigate('/jobs')} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Vehicle header */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <Badge className="bg-warning text-warning-foreground font-bold px-3 py-1">{job.vehicle_reg}</Badge>
            <Badge className={statusClasses}>{statusCfg.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{job.vehicle_make} {job.vehicle_model} — {job.vehicle_colour}</p>
          {job.external_job_number && <p className="text-xs text-muted-foreground mt-1">Ref: {job.external_job_number}</p>}
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

        {/* Pricing */}
        {(job.distance_miles != null || job.total_price != null) && (
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1.5">
              <PoundSterling className="h-4 w-4" /> Pricing
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {job.distance_miles != null && <div><span className="text-muted-foreground">Distance:</span> {job.distance_miles} mi</div>}
              {job.rate_per_mile != null && <div><span className="text-muted-foreground">Rate:</span> £{job.rate_per_mile}/mi</div>}
              {job.total_price != null && <div><span className="text-muted-foreground">Total:</span> <strong>£{job.total_price}</strong></div>}
              {job.caz_ulez_flag && <div><span className="text-muted-foreground">CAZ/ULEZ:</span> {job.caz_ulez_flag}</div>}
              {job.caz_ulez_cost != null && <div><span className="text-muted-foreground">CAZ Cost:</span> £{job.caz_ulez_cost}</div>}
              {job.other_expenses != null && <div><span className="text-muted-foreground">Other:</span> £{job.other_expenses}</div>}
            </div>
          </Card>
        )}

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
