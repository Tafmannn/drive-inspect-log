import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useJob } from "@/hooks/useJobs";
import { Loader2, Printer, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FUEL_PERCENT_TO_LABEL } from "@/lib/types";
import { openPodEmail } from "@/lib/podEmail";
import type { Inspection, DamageItem } from "@/lib/types";

export const PodReport = () => {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const { data: job, isLoading } = useJob(jobId ?? '');

  if (isLoading || !job) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="POD Report" showBack onBack={() => navigate(-1)} />
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  const pickup = job.inspections.find((i) => i.type === 'pickup');
  const delivery = job.inspections.find((i) => i.type === 'delivery');
  const pickupPhotos = job.photos.filter((p) => p.type.startsWith('pickup_'));
  const deliveryPhotos = job.photos.filter((p) => p.type.startsWith('delivery_'));
  const damagePhotos = job.photos.filter((p) => p.type === 'damage_close_up');
  const pickupDamages = job.damage_items.filter((d) => pickup && d.inspection_id === pickup.id);
  const deliveryDamages = job.damage_items.filter((d) => delivery && d.inspection_id === delivery.id);
  const additionalPhotos = job.photos.filter((p) => p.label);

  const InspectionSection = ({ title, inspection, photoCount, damages }: { title: string; inspection: Inspection | undefined; photoCount: number; damages: DamageItem[] }) => {
    if (!inspection) return <Card className="p-4"><p className="text-sm text-muted-foreground">{title}: Not completed</p></Card>;
    return (
      <Card className="p-4 space-y-3 print:break-inside-avoid">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Date:</span> {inspection.inspected_at ? new Date(inspection.inspected_at).toLocaleString() : '—'}</div>
          <div><span className="text-muted-foreground">Driver:</span> {inspection.inspected_by_name || '—'}</div>
          <div><span className="text-muted-foreground">Customer:</span> {inspection.customer_name || '—'}</div>
          <div><span className="text-muted-foreground">Odometer:</span> {inspection.odometer ?? '—'}</div>
          <div><span className="text-muted-foreground">Fuel:</span> {inspection.fuel_level_percent != null ? (FUEL_PERCENT_TO_LABEL[inspection.fuel_level_percent] ?? `${inspection.fuel_level_percent}%`) : '—'}</div>
          {inspection.vehicle_condition && <div><span className="text-muted-foreground">Condition:</span> {inspection.vehicle_condition}</div>}
          {inspection.light_condition && <div><span className="text-muted-foreground">Light:</span> {inspection.light_condition}</div>}
        </div>
        {damages.length > 0 && (
          <div>
            <p className="text-sm font-medium">Damages ({damages.length}):</p>
            <ul className="list-disc list-inside text-sm">
              {damages.map((d) => (
                <li key={d.id}>{d.area} — {d.item}: {d.damage_types?.join(', ')}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="text-sm text-muted-foreground">
          Photos: {photoCount}
        </div>
        {/* Signatures */}
        <div className="grid grid-cols-2 gap-4">
          {inspection.driver_signature_url && (
            <div>
              <p className="text-sm font-medium">Driver: {inspection.inspected_by_name}</p>
              <img src={inspection.driver_signature_url} alt="Driver signature" className="h-16 border rounded" />
            </div>
          )}
          {inspection.customer_signature_url && (
            <div>
              <p className="text-sm font-medium">Customer: {inspection.customer_name}</p>
              <img src={inspection.customer_signature_url} alt="Customer signature" className="h-16 border rounded" />
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="POD Report" showBack onBack={() => navigate(-1)}>
        <Button size="sm" variant="ghost" className="text-app-header-foreground hover:bg-white/20 print:hidden" onClick={() => window.print()}>
          <Printer className="h-5 w-5" />
        </Button>
      </AppHeader>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="text-center print:mb-4">
          <h1 className="text-2xl font-bold">AXENTRA</h1>
          <p className="text-sm text-muted-foreground">Proof of Delivery</p>
        </div>

        <Card className="p-4 space-y-2 print:break-inside-avoid">
          <div className="flex justify-between items-center">
            <span className="font-semibold">{job.vehicle_reg}</span>
            <span className="text-sm text-muted-foreground">Ref: {job.external_job_number || job.id.slice(0, 8)}</span>
          </div>
          <p className="text-sm">{job.vehicle_make} {job.vehicle_model} — {job.vehicle_colour}</p>
          <p className="text-sm font-medium">{job.pickup_city} → {job.delivery_city}</p>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
          <Card className="p-4 space-y-1 print:break-inside-avoid">
            <h3 className="font-semibold text-sm text-muted-foreground">Pickup</h3>
            <p className="text-sm">{job.pickup_contact_name} ({job.pickup_contact_phone})</p>
            {job.pickup_company && <p className="text-sm">{job.pickup_company}</p>}
            <p className="text-sm">{[job.pickup_address_line1, job.pickup_city, job.pickup_postcode].join(', ')}</p>
          </Card>
          <Card className="p-4 space-y-1 print:break-inside-avoid">
            <h3 className="font-semibold text-sm text-muted-foreground">Delivery</h3>
            <p className="text-sm">{job.delivery_contact_name} ({job.delivery_contact_phone})</p>
            {job.delivery_company && <p className="text-sm">{job.delivery_company}</p>}
            <p className="text-sm">{[job.delivery_address_line1, job.delivery_city, job.delivery_postcode].join(', ')}</p>
          </Card>
        </div>

        <InspectionSection title="Pickup Inspection" inspection={pickup} photoCount={pickupPhotos.length} damages={pickupDamages} />
        <InspectionSection title="Delivery Inspection" inspection={delivery} photoCount={deliveryPhotos.length} damages={deliveryDamages} />

        {/* Photo summary counts only - no heavy images */}
        <Card className="p-4 print:break-inside-avoid">
          <h3 className="font-semibold mb-2">Photo Summary</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Pickup photos: <strong>{pickupPhotos.length}</strong></div>
            <div>Delivery photos: <strong>{deliveryPhotos.length}</strong></div>
            <div>Damage close-ups: <strong>{damagePhotos.length}</strong></div>
            <div>Additional labelled: <strong>{additionalPhotos.length}</strong></div>
          </div>
          {additionalPhotos.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground">Labels: {additionalPhotos.map((p) => p.label).join(', ')}</p>
            </div>
          )}
        </Card>

        <div className="flex gap-3 print:hidden">
          <Button className="flex-1" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print Report
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => openPodEmail(job)}>
            <Mail className="h-4 w-4 mr-2" /> Email POD
          </Button>
        </div>
      </div>
    </div>
  );
};
