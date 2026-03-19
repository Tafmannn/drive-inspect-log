import { useState, useEffect } from "react";
import { resolveMediaUrlAsync } from "@/lib/mediaResolver";
import { resolveSignatureUrlSimple } from "@/lib/resolveSignatureUrlSimple";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useJob, useUpdateJob } from "@/hooks/useJobs";
import { useJobExpenses } from "@/hooks/useExpenses";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSafeBack } from "@/hooks/useSafeBack";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateForEvent } from "@/lib/mutationEvents";
// resolveBackTarget removed — using navigate(-1) for natural back behavior
import {
  Loader2,
  Mail,
  Share2,
  FileDown,
  ImageOff,
  PenLine,
  Images,
  Receipt,
  CheckCircle,
} from "lucide-react";
import { openPodEmail, generatePodEmailBody } from "@/lib/podEmail";
import { sharePodPdf, emailPodPdf } from "@/lib/podPdf";
import { FUEL_PERCENT_TO_LABEL } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { getStatusStyle } from "@/lib/statusConfig";
import { UKPlate } from "@/components/UKPlate";
import { getChecklistItems } from "@/lib/inspectionFields";
import { useAuth } from "@/context/AuthContext";
import type { Photo } from "@/lib/types";

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

const SignatureCard = ({
  label,
  name,
  url,
  slot,
}: {
  label: string;
  name: string | null | undefined;
  url: string | null;
  slot?: string;
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
        {label}
      </div>
      <div className="text-xs text-foreground font-medium">{name || "—"}</div>
      {url && !failed ? (
        <img
          src={url}
          alt={`${label} signature`}
          className="w-full h-20 object-contain rounded border border-border bg-slate-100"
          onLoad={() => console.info("[SIG IMG LOADED]", { slot, url: url.slice(0, 120) })}
          onError={() => {
            console.error("[SIG IMG FAILED]", { slot, url: url.slice(0, 120) });
            setFailed(true);
          }}
        />
      ) : (
        <div className="h-16 border border-dashed rounded-md bg-muted/50 flex flex-col items-center justify-center gap-0.5">
          {url ? (
            <>
              <ImageOff className="h-4 w-4 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground">
                Couldn't load
              </span>
            </>
          ) : (
            <>
              <PenLine className="h-4 w-4 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground">
                Not signed
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const PodReport = () => {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const goBack = useSafeBack(jobId ? `/jobs/${jobId}` : "/jobs");
  const [searchParams] = useSearchParams();
  const { data: job, isLoading } = useJob(jobId ?? "");
  const { data: jobExpenses } = useJobExpenses(jobId ?? "");
  const { isAdmin, isSuperAdmin } = useAuth();
  const updateJob = useUpdateJob();
  const qc = useQueryClient();

  const [pdfLoading, setPdfLoading] = useState(false);
  const [downloadingPhotos, setDownloadingPhotos] = useState(false);
  const [confirmingReview, setConfirmingReview] = useState(false);

  const canConfirmReview = (isAdmin || isSuperAdmin) && job &&
    ["pod_ready", "delivery_complete"].includes(job.status);

  const handleConfirmReview = async () => {
    if (!job || confirmingReview) return;
    setConfirmingReview(true);
    try {
      await updateJob.mutateAsync({
        jobId: job.id,
        input: { status: "completed" as any, completed_at: new Date().toISOString() },
      });
      invalidateForEvent(qc, "job_status_changed", [["job", job.id]]);
      toast({ title: "Review confirmed — job completed" });
    } catch (e: any) {
      toast({ title: "Failed to confirm", description: e.message, variant: "destructive" });
    } finally {
      setConfirmingReview(false);
    }
  };
  const [resolvedSignatures, setResolvedSignatures] = useState<
    Record<string, string | null>
  >({});
  const [resolvedPhotos, setResolvedPhotos] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    let cancelled = false;
    const effectId = Date.now();

    async function resolveAllMedia() {
      if (!job) return;

      const pickup = job.inspections.find((i) => i.type === "pickup");
      const delivery = job.inspections.find((i) => i.type === "delivery");

      const nextSignatures: Record<string, string | null> = {};
      const nextPhotos: Record<string, string> = {};

      const sigSlots: Record<string, string | null> = {
        pickup_driver: pickup?.driver_signature_url ?? null,
        pickup_customer: pickup?.customer_signature_url ?? null,
        delivery_driver: delivery?.driver_signature_url ?? null,
        delivery_customer: delivery?.customer_signature_url ?? null,
      };

      console.info("[SIG SLOTS]", sigSlots);

      // Resolve each signature slot independently via simple helper
      await Promise.all(
        Object.entries(sigSlots).map(async ([slot, raw]) => {
          if (!raw) {
            nextSignatures[slot] = null;
            return;
          }

          try {
            const resolved = await resolveSignatureUrlSimple(raw);
            if (cancelled) return;

            if (!resolved || !resolved.startsWith("https://")) {
              console.error("[SIG FAIL]", { slot, raw: raw.slice(0, 80), resolved });
              nextSignatures[slot] = null;
              return;
            }
            nextSignatures[slot] = resolved;
          } catch (err) {
            nextSignatures[slot] = null;
            console.error("[SIG EXCEPTION]", {
              slot,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        })
      );

      if (cancelled) {
        console.info("[POD-Sig] effect cancelled, discarding", { effectId });
        return;
      }

      // Resolve photos in parallel
      await Promise.all(
        (job.photos ?? []).map(async (photo) => {
          const resolved = await resolveMediaUrlAsync(photo.url);
          if (resolved && !cancelled) {
            nextPhotos[photo.id] = resolved;
          }
        })
      );

      if (!cancelled) {
        console.info("[POD-Sig] committing state", {
          effectId,
          slots: Object.fromEntries(
            Object.entries(nextSignatures).map(([k, v]) => [k, v ? "https://..." : null])
          ),
        });
        setResolvedSignatures(nextSignatures);
        setResolvedPhotos(nextPhotos);
      }
    }

    void resolveAllMedia();

    return () => {
      cancelled = true;
    };
  }, [job]);

  const handleDownloadPhotos = async (photos: Photo[], label: string) => {
    if (!photos.length) {
      toast({ title: `No ${label} photos to download` });
      return;
    }

    setDownloadingPhotos(true);
    try {
      let downloaded = 0;

      for (const photo of photos) {
        const url =
          resolvedPhotos[photo.id] || (await resolveMediaUrlAsync(photo.url));
        if (!url) continue;

        try {
          const res = await fetch(url);
          if (!res.ok) continue;

          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = objUrl;
          const ext = blob.type.includes("png") ? "png" : "jpg";
          a.download = `${label}_${photo.label || photo.type}_${downloaded + 1}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(objUrl);
          downloaded++;
          await new Promise((r) => setTimeout(r, 300));
        } catch {
          // skip individual failures
        }
      }

      toast({ title: `Downloaded ${downloaded}/${photos.length} ${label} photos` });
    } finally {
      setDownloadingPhotos(false);
    }
  };

  const handleShare = async () => {
    if (!job) return;

    const { subject, body } = generatePodEmailBody(job);
    const shareText = `${subject}\n\n${body}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: subject, text: shareText });
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== "AbortError") {
          toast({
            title: "Share failed. Please try again.",
            variant: "destructive",
          });
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Copied to clipboard." });
      } catch {
        openPodEmail(job);
      }
    }
  };

  const handleSharePdf = async () => {
    if (!job) return;

    setPdfLoading(true);
    try {
      const billable = (jobExpenses ?? []).map((e) => ({
        id: e.id,
        category: e.category,
        label: e.label ?? null,
        amount: Number(e.amount),
        billable_on_pod: (e as any).billable_on_pod ?? true,
      }));
      await sharePodPdf(job, billable);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast({
          title: "PDF share failed. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setPdfLoading(false);
    }
  };

  const handleEmailPdf = async () => {
    if (!job) return;

    setPdfLoading(true);
    try {
      const billable = (jobExpenses ?? []).map((e) => ({
        id: e.id,
        category: e.category,
        label: e.label ?? null,
        amount: Number(e.amount),
        billable_on_pod: (e as any).billable_on_pod ?? true,
      }));
      await emailPodPdf(job, billable);

      if (!navigator.share) {
        toast({
          title: "PDF downloaded — attach it to your email",
          description:
            "Your email app should have opened with a pre-filled message. Attach the downloaded PDF before sending.",
        });
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast({
          title: "Email failed. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setPdfLoading(false);
    }
  };

  if (isLoading || !job) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader title="POD Report" showBack onBack={goBack} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
  const statusStyle = getStatusStyle(job.status);
  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");
  const pickupDamages = job.damage_items.filter(
    (d) => pickup && d.inspection_id === pickup.id
  );
  const deliveryDamages = job.damage_items.filter(
    (d) => delivery && d.inspection_id === delivery.id
  );
  const pickupPhotos = job.photos.filter((p) => p.type.startsWith("pickup_"));
  const deliveryPhotos = job.photos.filter((p) => p.type.startsWith("delivery_"));
  const damagePhotos = job.photos.filter((p) => p.type === "damage_close_up");

  const pickupChecklistItems = getChecklistItems(pickup);
  const deliveryChecklistItems = getChecklistItems(delivery);

  const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right">
        {value}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted flex flex-col print:bg-white">
      <div className="print:hidden">
        <AppHeader title="POD Report" showBack onBack={goBack}>
          <div className="flex gap-1">
            {(isAdmin || isSuperAdmin) && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1"
                onClick={() => navigate(`/invoice/new?jobId=${jobId}`)}
              >
                <Receipt className="h-4 w-4" />
                Invoice
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={handleSharePdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              PDF
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={handleEmailPdf}
              disabled={pdfLoading}
            >
              <Mail className="h-4 w-4" />
              Email
            </Button>
            <Button size="sm" variant="ghost" className="gap-1" onClick={handleShare}>
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </div>
        </AppHeader>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-6 px-3 sm:px-6 space-y-4 print:py-0 print:px-0">
          <Card className="border border-border shadow-sm print:shadow-none print:border-none">
            <div className="flex items-center justify-between px-6 py-4 bg-foreground text-background rounded-t-lg print:rounded-none">
              <div className="flex flex-col">
                <span className="text-xs tracking-[0.15em] uppercase opacity-70">
                  Axentra Vehicle Logistics
                </span>
                <span className="text-lg font-semibold tracking-wide">
                  Proof of Delivery
                </span>
              </div>
              <div className="text-right text-xs">
                <div className="font-medium tracking-widest">AXENTRA</div>
                <div className="opacity-70">
                  Job <span className="font-mono">{ref}</span>
                </div>
                <div className="opacity-50 text-[10px]">
                  {safeDate(job.completed_at || new Date().toISOString())}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 print:p-4 print:space-y-4">
              <Card className="p-4 space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <UKPlate reg={job.vehicle_reg} variant="rear" />
                  <span
                    style={{
                      backgroundColor: statusStyle.backgroundColor,
                      color: statusStyle.color,
                    }}
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase leading-none"
                  >
                    {statusStyle.label}
                  </span>
                </div>
                <h3 className="text-sm font-semibold mb-2">Vehicle Details</h3>
                <DetailRow label="Registration" value={job.vehicle_reg} />
                <DetailRow
                  label="Make / Model"
                  value={`${job.vehicle_make} ${job.vehicle_model}`}
                />
                <DetailRow label="Colour" value={job.vehicle_colour} />
                {job.vehicle_year && <DetailRow label="Year" value={job.vehicle_year} />}
                <DetailRow label="Job ID" value={`Job ${ref}`} />
                <DetailRow
                  label="Route"
                  value={`${job.pickup_city || "—"} → ${job.delivery_city || "—"}`}
                />
                <DetailRow
                  label="Collection Status"
                  value={pickup ? "✓ Collected" : "Not collected"}
                />
                <DetailRow
                  label="Delivery Status"
                  value={delivery ? "✓ Delivered" : "Not delivered"}
                />
                <DetailRow
                  label="Assigned Driver"
                  value={job.resolvedDriverName || job.driver_name || "Unassigned"}
                />
              </Card>

              {/* Confirm Review Button — admin only, for reviewable statuses */}
              {canConfirmReview && (
                <div className="print:hidden">
                  <Button
                    className="w-full min-h-[48px] text-sm font-semibold gap-2"
                    onClick={handleConfirmReview}
                    disabled={confirmingReview}
                  >
                    {confirmingReview ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Confirm Review — Mark Complete
                  </Button>
                </div>
              )}

              <Separator className="print:hidden" />

              <Card className="p-4 space-y-1">
                <h3 className="text-sm font-semibold mb-2">Pickup Details</h3>
                <DetailRow
                  label="Contact"
                  value={`${job.pickup_contact_name} (${job.pickup_contact_phone})`}
                />
                <DetailRow
                  label="Address"
                  value={`${job.pickup_address_line1}, ${job.pickup_city}, ${job.pickup_postcode}`}
                />
                {job.pickup_company && (
                  <DetailRow label="Company" value={job.pickup_company} />
                )}
                <DetailRow
                  label="Date / Time"
                  value={pickup ? safeDate(pickup.inspected_at) : "—"}
                />
                <DetailRow
                  label="Odometer"
                  value={
                    pickup?.odometer != null
                      ? pickup.odometer.toLocaleString("en-GB")
                      : "—"
                  }
                />
                <DetailRow
                  label="Fuel"
                  value={fuelLabel(pickup?.fuel_level_percent ?? null)}
                />
                <DetailRow label="Driver" value={pickup?.inspected_by_name && pickup.inspected_by_name !== "Driver" ? pickup.inspected_by_name : (job.resolvedDriverName || job.driver_name || "—")} />
                <DetailRow label="Customer" value={pickup?.customer_name || "—"} />
                <DetailRow label="Damages" value={String(pickupDamages.length)} />
                <DetailRow label="Photos" value={String(pickupPhotos.length)} />
              </Card>

              {pickup && pickupChecklistItems.length > 0 && (
                <Card className="p-4 space-y-2">
                  <h3 className="text-sm font-semibold">Pickup Checklist</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5">
                    {pickupChecklistItems.map((item) => (
                      <div key={item.key} className="flex justify-between py-0.5">
                        <span className="text-xs text-muted-foreground">
                          {item.label}
                        </span>
                        <span className="text-xs font-medium text-foreground ml-2">
                          {yesNo(pickup[item.key] as string | null)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {pickup.notes && (
                    <p className="text-xs mt-2">
                      <span className="font-medium">Notes:</span>{" "}
                      <span className="text-muted-foreground">{pickup.notes}</span>
                    </p>
                  )}
                </Card>
              )}

              <Card className="p-4 space-y-1">
                <h3 className="text-sm font-semibold mb-2">Delivery Details</h3>
                <DetailRow
                  label="Contact"
                  value={`${job.delivery_contact_name} (${job.delivery_contact_phone})`}
                />
                <DetailRow
                  label="Address"
                  value={`${job.delivery_address_line1}, ${job.delivery_city}, ${job.delivery_postcode}`}
                />
                {job.delivery_company && (
                  <DetailRow label="Company" value={job.delivery_company} />
                )}
                <DetailRow
                  label="Date / Time"
                  value={delivery ? safeDate(delivery.inspected_at) : "—"}
                />
                <DetailRow
                  label="Odometer"
                  value={
                    delivery?.odometer != null
                      ? delivery.odometer.toLocaleString("en-GB")
                      : "—"
                  }
                />
                <DetailRow
                  label="Fuel"
                  value={fuelLabel(delivery?.fuel_level_percent ?? null)}
                />
                <DetailRow label="Driver" value={delivery?.inspected_by_name && delivery.inspected_by_name !== "Driver" ? delivery.inspected_by_name : (job.resolvedDriverName || job.driver_name || "—")} />
                <DetailRow label="Customer" value={delivery?.customer_name || "—"} />
                <DetailRow label="Damages" value={String(deliveryDamages.length)} />
                <DetailRow label="Photos" value={String(deliveryPhotos.length)} />
              </Card>

              {delivery && deliveryChecklistItems.length > 0 && (
                <Card className="p-4 space-y-2">
                  <h3 className="text-sm font-semibold">Delivery Checklist</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5">
                    {deliveryChecklistItems.map((item) => (
                      <div key={item.key} className="flex justify-between py-0.5">
                        <span className="text-xs text-muted-foreground">
                          {item.label}
                        </span>
                        <span className="text-xs font-medium text-foreground ml-2">
                          {yesNo(delivery[item.key] as string | null)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {delivery.notes && (
                    <p className="text-xs mt-2">
                      <span className="font-medium">Notes:</span>{" "}
                      <span className="text-muted-foreground">{delivery.notes}</span>
                    </p>
                  )}
                </Card>
              )}

              {(pickupDamages.length > 0 || deliveryDamages.length > 0) && (
                <Card className="p-4 space-y-2">
                  <h3 className="text-sm font-semibold">Damage Summary</h3>
                  {[...pickupDamages, ...deliveryDamages].map((d) => (
                    <div key={d.id} className="flex justify-between text-xs py-0.5">
                      <span className="text-muted-foreground">
                        {d.area} – {d.item}: {d.damage_types?.join(", ") || "—"}
                      </span>
                      {d.notes && (
                        <span className="text-muted-foreground ml-2 italic">
                          {d.notes}
                        </span>
                      )}
                    </div>
                  ))}
                </Card>
              )}

              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Photos</h3>
                  {(isAdmin || isSuperAdmin) && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        disabled={downloadingPhotos || pickupPhotos.length === 0}
                        onClick={() =>
                          handleDownloadPhotos(pickupPhotos, `${ref}_Collection`)
                        }
                      >
                        <Images className="w-3 h-3" />
                        Collection
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        disabled={downloadingPhotos || deliveryPhotos.length === 0}
                        onClick={() =>
                          handleDownloadPhotos(deliveryPhotos, `${ref}_Delivery`)
                        }
                      >
                        <Images className="w-3 h-3" />
                        Delivery
                      </Button>
                    </div>
                  )}
                </div>

                <PhotoViewer
                  title="Collection Photos"
                  photos={pickupPhotos
                    .map((p) => ({
                      url: resolvedPhotos[p.id] || "",
                      label:
                        p.label ||
                        p.type.replace("pickup_", "").replace(/_/g, " "),
                    }))
                    .filter((p) => !!p.url)}
                />

                <PhotoViewer
                  title="Delivery Photos"
                  photos={deliveryPhotos
                    .map((p) => ({
                      url: resolvedPhotos[p.id] || "",
                      label:
                        p.label ||
                        p.type.replace("delivery_", "").replace(/_/g, " "),
                    }))
                    .filter((p) => !!p.url)}
                />

                <PhotoViewer
                  title="Damage Close-ups"
                  photos={damagePhotos
                    .map((p) => ({
                      url: resolvedPhotos[p.id] || "",
                      label: p.label || "Damage",
                    }))
                    .filter((p) => !!p.url)}
                />

                <p className="text-[11px] text-muted-foreground pt-1">
                  Full-resolution images are stored securely within Axentra and
                  can be supplied on request.
                </p>
              </Card>

              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-semibold">Signatures</h3>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                  <SignatureCard
                    label="Pickup Driver"
                    name={pickup?.inspected_by_name}
                    url={resolvedSignatures["pickup_driver"] ?? null}
                    slot="pickup_driver"
                  />
                  <SignatureCard
                    label="Pickup Customer"
                    name={pickup?.customer_name}
                    url={resolvedSignatures["pickup_customer"] ?? null}
                    slot="pickup_customer"
                  />
                  <SignatureCard
                    label="Delivery Driver"
                    name={delivery?.inspected_by_name}
                    url={resolvedSignatures["delivery_driver"] ?? null}
                    slot="delivery_driver"
                  />
                  <SignatureCard
                    label="Delivery Customer"
                    name={delivery?.customer_name}
                    url={resolvedSignatures["delivery_customer"] ?? null}
                    slot="delivery_customer"
                  />
                </div>
              </Card>

              {(() => {
                const billableExpenses = (jobExpenses ?? []).filter(
                  (e: any) => e.billable_on_pod !== false
                );

                return (
                  <Card className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Billable Expenses</h3>
                      <span className="text-xs font-medium text-foreground">
                        {billableExpenses.length} expenses
                      </span>
                    </div>
                    {billableExpenses.length > 0 ? (
                      <div className="space-y-1">
                        {billableExpenses.map((e: any) => (
                          <div key={e.id} className="flex justify-between text-xs py-0.5">
                            <span className="text-muted-foreground">
                              {e.category}
                              {e.label ? ` – ${e.label}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No billable expenses recorded
                      </p>
                    )}
                    <div className="print:hidden">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/expenses/new?jobId=${jobId}`)}
                      >
                        Add Expense
                      </Button>
                    </div>
                  </Card>
                );
              })()}

              <Card className="p-4 space-y-2 text-xs text-muted-foreground">
                <p>
                  This Proof of Delivery report was generated by the Axentra Vehicle
                  Logistics system.
                </p>
                <p>
                  Report reference: <span className="font-mono">{ref}</span> •
                  Generated: {safeDate(new Date().toISOString())}
                </p>
                <p className="text-[10px] opacity-70">
                  All images and data are stored securely. Unauthorised reproduction
                  is prohibited.
                </p>
              </Card>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};