import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useJob } from "@/hooks/useJobs";
import { useJobExpenses } from "@/hooks/useExpenses";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Mail, Share2, FileDown } from "lucide-react";
import { openPodEmail, generatePodEmailBody } from "@/lib/podEmail";
import { sharePodPdf, emailPodPdf } from "@/lib/podPdf";
import { FUEL_PERCENT_TO_LABEL } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { getStatusStyle } from "@/lib/statusConfig";
import { UKPlate } from "@/components/UKPlate";
import { CHECKLIST_FIELDS, getChecklistItems } from "@/lib/inspectionFields";
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
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const yesNo = (val: string | null | undefined): string => {
  if (!val) return "—";
  return val;
};

// CHECKLIST_FIELDS and getChecklistItems imported from @/lib/inspectionFields

export const PodReport = () => {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const { data: job, isLoading } = useJob(jobId ?? "");
  const { data: jobExpenses } = useJobExpenses(jobId ?? "");
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleShare = async () => {
    if (!job) return;
    const { subject, body } = generatePodEmailBody(job);
    const shareText = `${subject}\n\n${body}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: subject, text: shareText });
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== "AbortError") {
          toast({ title: "Share failed", description: e.message, variant: "destructive" });
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Copied to clipboard", description: "POD report text copied." });
      } catch {
        openPodEmail(job);
      }
    }
  };

  const handleSharePdf = async () => {
    if (!job) return;
    setPdfLoading(true);
    try {
      const billable = (jobExpenses ?? []).map(e => ({
        id: e.id,
        category: e.category,
        label: e.label ?? null,
        amount: Number(e.amount),
        billable_on_pod: e.billable_on_pod,
      }));
      await sharePodPdf(job, billable);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast({ title: "PDF share failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
      }
    } finally {
      setPdfLoading(false);
    }
  };

  const handleEmailPdf = async () => {
    if (!job) return;
    setPdfLoading(true);
    try {
      const billable = (jobExpenses ?? []).map(e => ({
        id: e.id,
        category: e.category,
        label: e.label ?? null,
        amount: Number(e.amount),
        billable_on_pod: e.billable_on_pod,
      }));
      await emailPodPdf(job, billable);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast({ title: "Email failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
      }
    } finally {
      setPdfLoading(false);
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
  const statusStyle = getStatusStyle(job.status);
  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");
  const pickupDamages = job.damage_items.filter(d => pickup && d.inspection_id === pickup.id);
  const deliveryDamages = job.damage_items.filter(d => delivery && d.inspection_id === delivery.id);
  const pickupPhotos = job.photos.filter(p => p.type.startsWith("pickup_"));
  const deliveryPhotos = job.photos.filter(p => p.type.startsWith("delivery_"));
  const damagePhotos = job.photos.filter(p => p.type === "damage_close_up");

  const pickupChecklistItems = getChecklistItems(pickup);
  const deliveryChecklistItems = getChecklistItems(delivery);

  const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right">{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      <AppHeader title="POD Report" showBack>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="gap-1" onClick={handleSharePdf} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            PDF
          </Button>
          <Button size="sm" variant="ghost" className="gap-1" onClick={handleEmailPdf} disabled={pdfLoading}>
            <Mail className="h-4 w-4" />
            Email
          </Button>
          <Button size="sm" variant="ghost" className="gap-1" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>
      </AppHeader>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-6 px-3 sm:px-6 space-y-4">
          <Card className="border border-border shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 bg-foreground text-background rounded-t-lg">
              <div className="flex flex-col">
                <span className="text-xs tracking-[0.15em] uppercase opacity-70">Axentra Vehicle Logistics</span>
                <span className="text-lg font-semibold tracking-wide">Proof of Delivery</span>
              </div>
              <div className="text-right text-xs">
                <div className="font-medium tracking-widest">AXENTRA</div>
                <div className="opacity-70">Job <span className="font-mono">{ref}</span></div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Vehicle + Status header with UKPlate */}
              <Card className="p-4 space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <UKPlate reg={job.vehicle_reg} variant="rear" />
                  <span
                    style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase leading-none"
                  >
                    {statusStyle.label}
                  </span>
                </div>
                <h3 className="text-sm font-semibold mb-2">Vehicle Details</h3>
                <DetailRow label="Registration" value={job.vehicle_reg} />
                <DetailRow label="Make / Model" value={`${job.vehicle_make} ${job.vehicle_model}`} />
                <DetailRow label="Colour" value={job.vehicle_colour} />
                {job.vehicle_year && <DetailRow label="Year" value={job.vehicle_year} />}
                <DetailRow label="Job ID" value={`Job ${ref}`} />
                <DetailRow label="Route" value={`${job.pickup_city || "—"} → ${job.delivery_city || "—"}`} />
                <DetailRow label="Collection Status" value={pickup ? "✓ Collected" : "Not collected"} />
                <DetailRow label="Delivery Status" value={delivery ? "✓ Delivered" : "Not delivered"} />
              </Card>

              <Separator />

              <Card className="p-4 space-y-1">
                <h3 className="text-sm font-semibold mb-2">Pickup Details</h3>
                <DetailRow label="Contact" value={`${job.pickup_contact_name} (${job.pickup_contact_phone})`} />
                <DetailRow label="Address" value={`${job.pickup_address_line1}, ${job.pickup_city}, ${job.pickup_postcode}`} />
                {job.pickup_company && <DetailRow label="Company" value={job.pickup_company} />}
                <DetailRow label="Date / Time" value={pickup ? safeDate(pickup.inspected_at) : "—"} />
                <DetailRow label="Odometer" value={pickup?.odometer != null ? pickup.odometer.toLocaleString("en-GB") : "—"} />
                <DetailRow label="Fuel" value={fuelLabel(pickup?.fuel_level_percent ?? null)} />
                <DetailRow label="Driver" value={pickup?.inspected_by_name || "—"} />
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
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className="text-xs font-medium text-foreground ml-2">{yesNo(pickup[item.key] as string | null)}</span>
                      </div>
                    ))}
                  </div>
                  {pickup.notes && (
                    <p className="text-xs mt-2"><span className="font-medium">Notes:</span> <span className="text-muted-foreground">{pickup.notes}</span></p>
                  )}
                </Card>
              )}

              <Card className="p-4 space-y-1">
                <h3 className="text-sm font-semibold mb-2">Delivery Details</h3>
                <DetailRow label="Contact" value={`${job.delivery_contact_name} (${job.delivery_contact_phone})`} />
                <DetailRow label="Address" value={`${job.delivery_address_line1}, ${job.delivery_city}, ${job.delivery_postcode}`} />
                {job.delivery_company && <DetailRow label="Company" value={job.delivery_company} />}
                <DetailRow label="Date / Time" value={delivery ? safeDate(delivery.inspected_at) : "—"} />
                <DetailRow label="Odometer" value={delivery?.odometer != null ? delivery.odometer.toLocaleString("en-GB") : "—"} />
                <DetailRow label="Fuel" value={fuelLabel(delivery?.fuel_level_percent ?? null)} />
                <DetailRow label="Driver" value={delivery?.inspected_by_name || "—"} />
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
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className="text-xs font-medium text-foreground ml-2">{yesNo(delivery[item.key] as string | null)}</span>
                      </div>
                    ))}
                  </div>
                  {delivery.notes && (
                    <p className="text-xs mt-2"><span className="font-medium">Notes:</span> <span className="text-muted-foreground">{delivery.notes}</span></p>
                  )}
                </Card>
              )}

              {(pickupDamages.length > 0 || deliveryDamages.length > 0) && (
                <Card className="p-4 space-y-2">
                  <h3 className="text-sm font-semibold">Damage Summary</h3>
                  {[...pickupDamages, ...deliveryDamages].map((d) => (
                    <div key={d.id} className="flex justify-between text-xs py-0.5">
                      <span className="text-muted-foreground">{d.area} – {d.item}: {d.damage_types?.join(", ") || "—"}</span>
                      {d.notes && <span className="text-muted-foreground ml-2 italic">{d.notes}</span>}
                    </div>
                  ))}
                </Card>
              )}

              <Card className="p-4 space-y-4">
                <h3 className="text-sm font-semibold">Photos</h3>
                <PhotoViewer
                  title="Collection Photos"
                  photos={pickupPhotos.map(p => ({ url: p.url, label: p.label || p.type.replace("pickup_", "").replace(/_/g, " ") }))}
                />
                <PhotoViewer
                  title="Delivery Photos"
                  photos={deliveryPhotos.map(p => ({ url: p.url, label: p.label || p.type.replace("delivery_", "").replace(/_/g, " ") }))}
                />
                <PhotoViewer
                  title="Damage Close-ups"
                  photos={damagePhotos.map(p => ({ url: p.url, label: p.label || "Damage" }))}
                />
                <p className="text-[11px] text-muted-foreground pt-1">
                  Full-resolution images are stored securely within Axentra and can be supplied on request.
                </p>
              </Card>

              <Card className="p-4 space-y-2">
                <h3 className="text-sm font-semibold">Signatures</h3>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                  {[
                    { label: "Pickup Driver", name: pickup?.inspected_by_name, url: pickup?.driver_signature_url },
                    { label: "Pickup Customer", name: pickup?.customer_name, url: pickup?.customer_signature_url },
                    { label: "Delivery Driver", name: delivery?.inspected_by_name, url: delivery?.driver_signature_url },
                    { label: "Delivery Customer", name: delivery?.customer_name, url: delivery?.customer_signature_url },
                  ].map((sig, i) => (
                    <div key={i} className="space-y-1">
                      <div className="text-[10px] text-muted-foreground font-medium">{sig.label}</div>
                      <div className="text-xs text-foreground">{sig.name || "—"}</div>
                      {sig.url ? (
                        <img
                          src={sig.url}
                          alt={`${sig.label} signature`}
                          className="h-14 border rounded bg-white p-1 w-full object-contain"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = 'none';
                            const placeholder = document.createElement('div');
                            placeholder.className = 'h-14 border rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground';
                            placeholder.textContent = 'Image unavailable';
                            target.parentNode?.appendChild(placeholder);
                          }}
                        />
                      ) : (
                        <div className="h-14 border rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">Not signed</div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* ── Expenses (billable only on POD) — no amounts visible to drivers ── */}
              {(() => {
                const billableExpenses = (jobExpenses ?? []).filter((e: any) => e.billable_on_pod !== false);
                return (
                  <Card className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Billable Expenses</h3>
                      <span className="text-xs font-medium text-foreground">{billableExpenses.length} expenses</span>
                    </div>
                    {billableExpenses.length > 0 ? (
                      <div className="space-y-1">
                        {billableExpenses.map((e: any) => (
                          <div key={e.id} className="flex justify-between text-xs py-0.5">
                            <span className="text-muted-foreground">{e.category}{e.label ? ` – ${e.label}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No billable expenses recorded</p>
                    )}
                    <Button size="sm" variant="outline" onClick={() => navigate(`/expenses/new?jobId=${jobId}`)}>Add Expense</Button>
                  </Card>
                );
              })()}

              <Card className="p-4 space-y-2 text-xs text-muted-foreground">
                <h3 className="text-sm font-semibold text-foreground">Customer Declaration</h3>
                <p>
                  The customer confirms that the vehicle described above has been received at the delivery address in the
                  condition recorded on this report and any noted damage or exceptions have been agreed at the point of handover.
                </p>
              </Card>

              <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground">
                <span>Generated by Axentra Vehicle Logistics</span>
                <span>{new Date().toLocaleString("en-GB")} • Job {ref}</span>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};
