// src/pages/PodReport.tsx

import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useJob } from "@/hooks/useJobs";
import { Loader2, Printer, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FUEL_PERCENT_TO_LABEL } from "@/lib/types";
import { openPodEmail } from "@/lib/podEmail";
import type { Inspection, DamageItem } from "@/lib/types";

function formatFuel(pct: number | null | undefined): string {
  if (pct == null) return "N/A";
  return FUEL_PERCENT_TO_LABEL[pct] ?? `${pct}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatMileage(value: number | null | undefined): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB").format(value) + " mi";
  } catch {
    return `${value} mi`;
  }
}

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start || !end) return "N/A";
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return "N/A";
  const diffMs = e - s;
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

export const PodReport = () => {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const { data: job, isLoading } = useJob(jobId ?? "");

  if (isLoading || !job) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="POD Report" showBack onBack={() => navigate(-1)} />
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");

  const pickupPhotos = job.photos.filter((p) =>
    p.type.startsWith("pickup_"),
  );
  const deliveryPhotos = job.photos.filter((p) =>
    p.type.startsWith("delivery_"),
  );
  const damagePhotos = job.photos.filter(
    (p) => p.type === "damage_close_up",
  );
  const pickupDamages = job.damage_items.filter(
    (d) => pickup && d.inspection_id === pickup.id,
  );
  const deliveryDamages = job.damage_items.filter(
    (d) => delivery && d.inspection_id === delivery.id,
  );
  const additionalPhotos = job.photos.filter((p) => p.label);

  const pickupOdo = pickup?.odometer ?? null;
  const deliveryOdo = delivery?.odometer ?? null;
  const distance =
    pickupOdo != null && deliveryOdo != null
      ? deliveryOdo - pickupOdo
      : null;

  const jobRef = job.external_job_number || job.id.slice(0, 8);

  const InspectionSection = ({
    title,
    inspection,
    photoCount,
    damages,
  }: {
    title: string;
    inspection: Inspection | undefined;
    photoCount: number;
    damages: DamageItem[];
  }) => {
    if (!inspection) {
      return (
        <Card className="p-4 print:break-inside-avoid">
          <p className="text-sm text-muted-foreground">
            {title}: Not completed
          </p>
        </Card>
      );
    }

    return (
      <Card className="p-4 space-y-3 print:break-inside-avoid">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Date / Time:</span>{" "}
            {formatDateTime(inspection.inspected_at)}
          </div>
          <div>
            <span className="text-muted-foreground">Driver:</span>{" "}
            {inspection.inspected_by_name || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Customer:</span>{" "}
            {inspection.customer_name || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Odometer:</span>{" "}
            {formatMileage(inspection.odometer)}
          </div>
          <div>
            <span className="text-muted-foreground">Fuel:</span>{" "}
            {formatFuel(inspection.fuel_level_percent)}
          </div>
          {inspection.vehicle_condition && (
            <div>
              <span className="text-muted-foreground">Condition:</span>{" "}
              {inspection.vehicle_condition}
            </div>
          )}
          {inspection.light_condition && (
            <div>
              <span className="text-muted-foreground">Light:</span>{" "}
              {inspection.light_condition}
            </div>
          )}
        </div>

        {damages.length > 0 && (
          <div>
            <p className="text-sm font-medium">
              Recorded Damages ({damages.length})
            </p>
            <ul className="list-disc list-inside text-sm">
              {damages.map((d) => (
                <li key={d.id}>
                  {d.area} — {d.item}
                  {d.damage_types?.length
                    ? `: ${d.damage_types.join(", ")}`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          Photos captured: <strong>{photoCount}</strong>
        </div>

        {/* Signatures */}
        {(inspection.driver_signature_url ||
          inspection.customer_signature_url) && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            {inspection.driver_signature_url && (
              <div>
                <p className="text-sm font-medium">
                  Driver: {inspection.inspected_by_name || "—"}
                </p>
                <img
                  src={inspection.driver_signature_url}
                  alt="Driver signature"
                  className="h-16 border rounded bg-white"
                />
              </div>
            )}
            {inspection.customer_signature_url && (
              <div>
                <p className="text-sm font-medium">
                  Customer: {inspection.customer_name || "—"}
                </p>
                <img
                  src={inspection.customer_signature_url}
                  alt="Customer signature"
                  className="h-16 border rounded bg-white"
                />
              </div>
            )}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="POD Report"
        showBack
        onBack={() => navigate(-1)}
      >
        <Button
          size="sm"
          variant="ghost"
          className="text-app-header-foreground hover:bg-white/20 print:hidden"
          onClick={() => window.print()}
        >
          <Printer className="h-5 w-5" />
        </Button>
      </AppHeader>

      <div className="p-4 space-y-4 max-w-2xl mx-auto print:p-8">
        {/* Brand header */}
        <div className="text-center print:mb-4">
          <h1 className="text-2xl font-extrabold tracking-wide">
            AXENTRA VEHICLES
          </h1>
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
            Driven Vehicle Logistics · United Kingdom
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Proof of Delivery (POD) Confirmation
          </p>
        </div>

        {/* Job summary */}
        <Card className="p-4 space-y-2 print:break-inside-avoid">
          <div className="flex justify-between items-start gap-4">
            <div>
              <p className="text-sm font-semibold">
                {job.vehicle_reg}
              </p>
              <p className="text-sm">
                {job.vehicle_make} {job.vehicle_model} —{" "}
                {job.vehicle_colour}
              </p>
              {job.vehicle_year && (
                <p className="text-xs text-muted-foreground">
                  Year: {job.vehicle_year}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                Job Reference
              </p>
              <p className="text-sm font-semibold">{jobRef}</p>
              <p className="text-xs text-muted-foreground">
                Generated: {new Date().toLocaleString()}
              </p>
            </div>
          </div>
          <p className="text-sm font-medium mt-2">
            Route: {job.pickup_city} → {job.delivery_city}
          </p>
        </Card>

        {/* Journey summary card */}
        <Card className="p-4 space-y-2 print:break-inside-avoid">
          <h3 className="font-semibold text-base">
            Journey Summary
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">
                Pickup mileage:
              </span>{" "}
              {formatMileage(pickupOdo)}
            </div>
            <div>
              <span className="text-muted-foreground">
                Delivery mileage:
              </span>{" "}
              {formatMileage(deliveryOdo)}
            </div>
            <div>
              <span className="text-muted-foreground">
                Distance driven:
              </span>{" "}
              {distance != null
                ? `${new Intl.NumberFormat("en-GB").format(
                    distance,
                  )} mi`
                : "N/A"}
            </div>
            <div>
              <span className="text-muted-foreground">
                Journey duration:
              </span>{" "}
              {formatDuration(
                pickup?.inspected_at ?? null,
                delivery?.inspected_at ?? null,
              )}
            </div>
            <div>
              <span className="text-muted-foreground">
                Fuel at pickup:
              </span>{" "}
              {formatFuel(pickup?.fuel_level_percent)}
            </div>
            <div>
              <span className="text-muted-foreground">
                Fuel at delivery:
              </span>{" "}
              {formatFuel(delivery?.fuel_level_percent)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Note: Distance is calculated from the recorded odometer
            readings at pickup and delivery.
          </p>
        </Card>

        {/* Pickup / Delivery addresses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
          <Card className="p-4 space-y-1 print:break-inside-avoid">
            <h3 className="font-semibold text-sm text-muted-foreground">
              Pickup Location
            </h3>
            <p className="text-sm">
              {job.pickup_contact_name} (
              {job.pickup_contact_phone})
            </p>
            {job.pickup_company && (
              <p className="text-sm">{job.pickup_company}</p>
            )}
            <p className="text-sm">
              {[job.pickup_address_line1, job.pickup_city, job.pickup_postcode]
                .filter(Boolean)
                .join(", ")}
            </p>
          </Card>
          <Card className="p-4 space-y-1 print:break-inside-avoid">
            <h3 className="font-semibold text-sm text-muted-foreground">
              Delivery Location
            </h3>
            <p className="text-sm">
              {job.delivery_contact_name} (
              {job.delivery_contact_phone})
            </p>
            {job.delivery_company && (
              <p className="text-sm">{job.delivery_company}</p>
            )}
            <p className="text-sm">
              {[job.delivery_address_line1, job.delivery_city, job.delivery_postcode]
                .filter(Boolean)
                .join(", ")}
            </p>
          </Card>
        </div>

        {/* Inspections */}
        <InspectionSection
          title="Pickup Inspection"
          inspection={pickup}
          photoCount={pickupPhotos.length}
          damages={pickupDamages}
        />
        <InspectionSection
          title="Delivery Inspection"
          inspection={delivery}
          photoCount={deliveryPhotos.length}
          damages={deliveryDamages}
        />

        {/* Photo summary counts only - no heavy images */}
        <Card className="p-4 print:break-inside-avoid">
          <h3 className="font-semibold mb-2">Photo Summary</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              Pickup photos:{" "}
              <strong>{pickupPhotos.length}</strong>
            </div>
            <div>
              Delivery photos:{" "}
              <strong>{deliveryPhotos.length}</strong>
            </div>
            <div>
              Damage close-ups:{" "}
              <strong>{damagePhotos.length}</strong>
            </div>
            <div>
              Additional labelled:{" "}
              <strong>{additionalPhotos.length}</strong>
            </div>
          </div>
          {additionalPhotos.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground">
                Additional photo labels:{" "}
                {additionalPhotos
                  .map((p) => p.label)
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          )}
        </Card>

        {/* UK-style small print */}
        <p className="text-[10px] text-muted-foreground leading-snug print:mt-4">
          By signing at collection and delivery, the customer confirms
          that the vehicle condition, mileage and fuel level recorded
          on this Proof of Delivery are an accurate reflection of the
          vehicle at the relevant handover point. This document forms
          part of Axentra Vehicles&apos; records for the purposes of
          audit, insurance and dispute resolution.
        </p>

        {/* Actions (print / email) */}
        <div className="flex gap-3 print:hidden">
          <Button className="flex-1" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print Report
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => openPodEmail(job)}
          >
            <Mail className="h-4 w-4 mr-2" /> Email POD
          </Button>
        </div>
      </div>
    </div>
  );
};