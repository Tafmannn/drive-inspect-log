import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useJob } from "@/hooks/useJobs";
import { useParams } from "react-router-dom";
import { Loader2, Mail } from "lucide-react";
import { openPodEmail } from "@/lib/podEmail";
import { FUEL_PERCENT_TO_LABEL } from "@/lib/types";

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

export const PodReport = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const { data: job, isLoading } = useJob(jobId ?? "");

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

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      <AppHeader
        title="POD Report"
        showBack
        rightSlot={
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={() => openPodEmail(job)}
          >
            <Mail className="h-4 w-4" />
            Email POD
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-6 px-3 sm:px-6 space-y-4">
          {/* Top banner */}
          <Card className="border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white rounded-t-lg">
              <div className="flex flex-col">
                <span className="text-xs tracking-[0.25em] uppercase text-slate-300">
                  Axentra Vehicle Logistics
                </span>
                <span className="text-lg font-semibold tracking-wide">
                  Proof of Delivery
                </span>
              </div>
              <div className="text-right text-xs">
                <div className="font-medium tracking-widest text-white">
                  AXENTRA
                </div>
                <div className="text-slate-300">
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
                <Card className="bg-slate-50/60 border-slate-200">
                  <div className="p-4 space-y-1">
                    <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
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

                <Card className="bg-slate-50/60 border-slate-200">
                  <div className="p-4 space-y-1">
                    <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
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
                        <span className="font-medium text-foreground">
                          Date:
                        </span>{" "}
                        {pickup ? safeDate(pickup.inspected_at) : "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Customer:
                        </span>{" "}
                        {pickup?.customer_name || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Driver:
                        </span>{" "}
                        {pickup?.inspected_by_name || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Odometer:
                        </span>{" "}
                        {pickup?.odometer != null
                          ? pickup.odometer.toLocaleString("en-GB")
                          : "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Fuel:
                        </span>{" "}
                        {fuelLabel(pickup?.fuel_level_percent ?? null)}
                      </div>
                      {pickup?.vehicle_condition && (
                        <div>
                          <span className="font-medium text-foreground">
                            Condition:
                          </span>{" "}
                          {pickup.vehicle_condition}
                        </div>
                      )}
                      {pickup?.light_condition && (
                        <div>
                          <span className="font-medium text-foreground">
                            Light:
                          </span>{" "}
                          {pickup.light_condition}
                        </div>
                      )}
                      <div>
                        <span className="font-medium text-foreground">
                          Photos:
                        </span>{" "}
                        {pickupPhotos.length}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Damages:
                        </span>{" "}
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
                        <span className="font-medium text-foreground">
                          Date:
                        </span>{" "}
                        {delivery ? safeDate(delivery.inspected_at) : "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Customer:
                        </span>{" "}
                        {delivery?.customer_name || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Driver:
                        </span>{" "}
                        {delivery?.inspected_by_name || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Odometer:
                        </span>{" "}
                        {delivery?.odometer != null
                          ? delivery.odometer.toLocaleString("en-GB")
                          : "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Fuel:
                        </span>{" "}
                        {fuelLabel(delivery?.fuel_level_percent ?? null)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Photos:
                        </span>{" "}
                        {deliveryPhotos.length}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Damages:
                        </span>{" "}
                        {deliveryDamages.length}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Photo summary */}
              <Card className="bg-slate-50/80 border-slate-200">
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