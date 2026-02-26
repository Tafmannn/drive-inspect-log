import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useJob } from "@/hooks/useJobs";
import { useParams } from "react-router-dom";
import { Loader2, Mail, Share2 } from "lucide-react";
import { openPodEmail, generatePodEmailBody } from "@/lib/podEmail";
import { FUEL_PERCENT_TO_LABEL } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import type { Inspection } from "@/lib/types";

const fuelLabel = (pct: number | null | undefined): string => {
  if (pct == null) return "N/A";
  return FUEL_PERCENT_TO_LABEL[pct] ?? `${pct}%`;
};

const safeDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const yesNo = (val: string | null | undefined): string => {
  if (!val) return "—";
  return val;
};

// Checklist fields to display from the pickup inspection
const CHECKLIST_FIELDS: { key: keyof Inspection; label: string }[] = [
  { key: "vehicle_condition", label: "Vehicle Condition" },
  { key: "light_condition", label: "Light Condition" },
  { key: "oil_level_status", label: "Oil Level" },
  { key: "water_level_status", label: "Water Level" },
  { key: "handbook", label: "Handbook" },
  { key: "service_book", label: "Service Book" },
  { key: "mot", label: "MOT" },
  { key: "v5", label: "V5" },
  { key: "parcel_shelf", label: "Parcel Shelf" },
  { key: "spare_wheel_status", label: "Spare Wheel" },
  { key: "tool_kit", label: "Tool Kit" },
  { key: "tyre_inflation_kit", label: "Tyre Inflation Kit" },
  { key: "locking_wheel_nut", label: "Locking Wheel Nut" },
  { key: "sat_nav_working", label: "Sat Nav Working" },
  { key: "alloys_or_trims", label: "Alloys / Trims" },
  { key: "alloys_damaged", label: "Alloys Damaged" },
  { key: "wheel_trims_damaged", label: "Wheel Trims Damaged" },
  { key: "number_of_keys", label: "Number of Keys" },
  { key: "ev_charging_cables", label: "EV Charging Cables" },
  { key: "aerial", label: "Aerial" },
  { key: "customer_paperwork", label: "Customer Paperwork" },
];

export const PodReport = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const { data: job, isLoading } = useJob(jobId ?? "");

  const handleShare = async () => {
    if (!job) return;
    const { subject, body } = generatePodEmailBody(job);
    const shareText = `${subject}\n\n${body}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: subject,
          text: shareText,
        });
      } catch (e: unknown) {
        // User cancelled or share failed
        if (e instanceof Error && e.name !== "AbortError") {
          toast({ title: "Share failed", description: e.message, variant: "destructive" });
        }
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Copied to clipboard", description: "POD report text copied. Paste into any app to share." });
      } catch {
        // Final fallback: open mailto
        openPodEmail(job);
      }
    }
  };

  if (isLoading || !job) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader title="POD Report" showBack />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");
  const pickupDamages = job.damage_items.filter(
    (d) => pickup && d.inspection_id === pickup.id
  );
  const deliveryDamages = job.damage_items.filter(
    (d) => delivery && d.inspection_id === delivery.id
  );
  const pickupPhotos = job.photos.filter((p) =>
    p.type.startsWith("pickup_")
  );
  const deliveryPhotos = job.photos.filter((p) =>
    p.type.startsWith("delivery_")
  );
  const damagePhotos = job.photos.filter(
    (p) => p.type === "damage_close_up"
  );

  const pickupOdo = pickup?.odometer ?? null;
  const deliveryOdo = delivery?.odometer ?? null;
  const journeyMiles =
    pickupOdo != null && deliveryOdo != null
      ? deliveryOdo - pickupOdo
      : null;

  const journeyText =
    journeyMiles != null && journeyMiles >= 0
      ? `${pickupOdo.toLocaleString("en-GB")} → ${deliveryOdo.toLocaleString(
          "en-GB"
        )} miles (approx. ${journeyMiles.toLocaleString(
          "en-GB"
        )} miles driven)`
      : "Not available";

  // Filter checklist fields that have values
  const checklistItems = pickup
    ? CHECKLIST_FIELDS.filter((f) => {
        const val = pickup[f.key];
        return val != null && val !== "";
      })
    : [];

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      <AppHeader
        title="POD Report"
        showBack
      >
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={handleShare}
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={() => openPodEmail(job)}
          >
            <Mail className="h-4 w-4" />
            Email
          </Button>
        </div>
      </AppHeader>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-6 px-3 sm:px-6 space-y-4">
          {/* Top banner */}
          <Card className="border border-border shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 bg-foreground text-background rounded-t-lg">
              <div className="flex flex-col">
                <span className="text-xs tracking-[0.25em] uppercase opacity-70">
                  Axentra Vehicle Logistics
                </span>
                <span className="text-lg font-semibold tracking-wide">
                  Proof of Delivery
                </span>
              </div>
              <div className="text-right text-xs">
                <div className="font-medium tracking-widest">
                  AXENTRA
                </div>
                <div className="opacity-70">
                  Ref: <span className="font-mono">{ref}</span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Vehicle summary */}
              <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">
                    Vehicle
                  </div>
                  <div className="text-lg font-semibold">
                    {job.vehicle_reg} – {job.vehicle_make}{" "}
                    {job.vehicle_model}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {job.vehicle_colour}
                    {job.vehicle_year && ` • ${job.vehicle_year}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Job Reference: {ref}
                  </div>
                </div>
                <div className="space-y-1 text-sm md:text-right">
                  <div className="font-medium">Journey Overview</div>
                  <div className="text-muted-foreground">
                    {job.pickup_city || "Unknown"} →{" "}
                    {job.delivery_city || "Unknown"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Pickup: {job.pickup_postcode} • Delivery:{" "}
                    {job.delivery_postcode}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Mileage: {journeyText}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Pickup / Delivery addresses */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-muted/40 border-border">
                  <div className="p-4 space-y-1">
                    <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Pickup
                    </div>
                    <div className="text-sm font-medium">
                      {job.pickup_contact_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {job.pickup_contact_phone}
                    </div>
                    {job.pickup_company && (
                      <div className="text-xs text-muted-foreground">
                        {job.pickup_company}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {job.pickup_address_line1}
                      {job.pickup_city && `, ${job.pickup_city}`}
                      {job.pickup_postcode && `, ${job.pickup_postcode}`}
                    </div>
                  </div>
                </Card>

                <Card className="bg-muted/40 border-border">
                  <div className="p-4 space-y-1">
                    <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Delivery
                    </div>
                    <div className="text-sm font-medium">
                      {job.delivery_contact_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {job.delivery_contact_phone}
                    </div>
                    {job.delivery_company && (
                      <div className="text-xs text-muted-foreground">
                        {job.delivery_company}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {job.delivery_address_line1}
                      {job.delivery_city && `, ${job.delivery_city}`}
                      {job.delivery_postcode &&
                        `, ${job.delivery_postcode}`}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Inspection sections */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <div className="p-4 space-y-2">
                    <div className="text-sm font-semibold">
                      Pickup Inspection
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Date:</span>{" "}
                        {pickup ? safeDate(pickup.inspected_at) : "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Customer:</span>{" "}
                        {pickup?.customer_name || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Driver:</span>{" "}
                        {pickup?.inspected_by_name || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Odometer:</span>{" "}
                        {pickup?.odometer != null
                          ? pickup.odometer.toLocaleString("en-GB")
                          : "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Fuel:</span>{" "}
                        {fuelLabel(pickup?.fuel_level_percent ?? null)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Photos:</span>{" "}
                        {pickupPhotos.length}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Damages:</span>{" "}
                        {pickupDamages.length}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="p-4 space-y-2">
                    <div className="text-sm font-semibold">
                      Delivery Inspection
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Date:</span>{" "}
                        {delivery ? safeDate(delivery.inspected_at) : "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Customer:</span>{" "}
                        {delivery?.customer_name || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Driver:</span>{" "}
                        {delivery?.inspected_by_name || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Odometer:</span>{" "}
                        {delivery?.odometer != null
                          ? delivery.odometer.toLocaleString("en-GB")
                          : "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Fuel:</span>{" "}
                        {fuelLabel(delivery?.fuel_level_percent ?? null)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Photos:</span>{" "}
                        {deliveryPhotos.length}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Damages:</span>{" "}
                        {deliveryDamages.length}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Pickup Checklist */}
              {pickup && checklistItems.length > 0 && (
                <Card>
                  <div className="p-4 space-y-2">
                    <div className="text-sm font-semibold">
                      Pickup Checklist
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                      {checklistItems.map((item) => (
                        <div key={item.key} className="flex justify-between py-0.5">
                          <span className="text-muted-foreground">{item.label}:</span>
                          <span className="font-medium text-foreground ml-2">
                            {yesNo(pickup[item.key] as string | null)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {pickup.notes && (
                      <div className="text-xs mt-2">
                        <span className="font-medium text-foreground">Notes:</span>{" "}
                        <span className="text-muted-foreground">{pickup.notes}</span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Photo summary */}
              <Card className="bg-muted/40 border-border">
                <div className="p-4 space-y-2">
                  <div className="text-sm font-semibold">
                    Photo Summary
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
                    <div>
                      <div className="font-medium text-foreground">
                        Pickup photos
                      </div>
                      <div>{pickupPhotos.length}</div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">
                        Delivery photos
                      </div>
                      <div>{deliveryPhotos.length}</div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">
                        Damage close-ups
                      </div>
                      <div>{damagePhotos.length}</div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">
                        Total images
                      </div>
                      <div>
                        {pickupPhotos.length +
                          deliveryPhotos.length +
                          damagePhotos.length}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Full-resolution images are stored securely within
                    Axentra and can be supplied to clients, insurers or
                    auditors on request.
                  </p>
                </div>
              </Card>

              {/* Signatures */}
              <Card>
                <div className="p-4 space-y-2">
                  <div className="text-sm font-semibold">Signatures</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {pickup?.driver_signature_url && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Pickup – Driver ({pickup.inspected_by_name || "—"})</div>
                        <img src={pickup.driver_signature_url} alt="Driver signature" className="h-16 border rounded bg-white p-1" />
                      </div>
                    )}
                    {pickup?.customer_signature_url && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Pickup – Customer ({pickup.customer_name || "—"})</div>
                        <img src={pickup.customer_signature_url} alt="Customer signature" className="h-16 border rounded bg-white p-1" />
                      </div>
                    )}
                    {delivery?.driver_signature_url && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Delivery – Driver ({delivery.inspected_by_name || "—"})</div>
                        <img src={delivery.driver_signature_url} alt="Driver signature" className="h-16 border rounded bg-white p-1" />
                      </div>
                    )}
                    {delivery?.customer_signature_url && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Delivery – Customer ({delivery.customer_name || "—"})</div>
                        <img src={delivery.customer_signature_url} alt="Customer signature" className="h-16 border rounded bg-white p-1" />
                      </div>
                    )}
                  </div>
                  {!pickup?.driver_signature_url && !delivery?.driver_signature_url && (
                    <p className="text-xs text-muted-foreground">No signatures recorded.</p>
                  )}
                </div>
              </Card>

              {/* Declaration */}
              <Card>
                <div className="p-4 space-y-2 text-xs text-muted-foreground">
                  <div className="text-sm font-semibold text-foreground">
                    Customer Declaration
                  </div>
                  <p>
                    The customer confirms that the vehicle described above
                    has been received at the delivery address in the
                    condition recorded on this report and any noted damage
                    or exceptions have been agreed at the point of
                    handover.
                  </p>
                </div>
              </Card>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground">
                <span>
                  Generated by Axentra Vehicle Logistics – Proof of
                  Delivery
                </span>
                <span>
                  {new Date().toLocaleString("en-GB")} • Job {ref}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};
