/**
 * Driver Job Detail — Full Execution Screen
 *
 * Expands the Job Card primitive into a complete operational view.
 * Structure:
 *   1. HEADER — status badge · reg · job ref · vehicle info
 *   2. ROUTE  — full pickup & delivery with contacts
 *   3. ALERT  — restrictions / special instructions
 *   4. INSPECTIONS — pickup & delivery status + actions
 *   5. QR HANDOVER — collection & delivery QR codes
 *   6. NOTES — job notes, access notes
 *   7. ACTIONS — primary CTA + secondary (expenses, edit, POD)
 *
 * Does NOT include: financial data, admin rate, activity log for drivers.
 *
 * EXECUTABLE-STATE ENFORCEMENT:
 *   Primary CTA is gated by evaluateExecutableState().
 *   Blocked → no progression. Review-only → view allowed.
 */

import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { withFrom } from "@/lib/navigationUtils";
import { useSafeBack } from "@/hooks/useSafeBack";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { EvidenceStatusBadges } from "@/components/EvidenceStatusBadges";
import { useJob, useDeleteJob, useAdminChangeStatus, useActiveJobs } from "@/hooks/useJobs";
import { useJobExpenses } from "@/hooks/useExpenses";
import { evaluateExecutableState, type ExecutableState } from "@/lib/executionRanking";
import {
  Phone, MapPin, Building, Edit, ClipboardCheck, Truck,
  FileText, Receipt, QrCode, Navigation, AlertTriangle, ChevronRight,
  Trash2, RefreshCw, Images, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { createQrConfirmation, getQrConfirmationsForJob, buildQrUrl, type QrConfirmation } from "@/lib/qrApi";
import { QrDisplayModal } from "@/components/QrDisplayModal";
import { useAuth } from "@/context/AuthContext";
import { getStatusStyle, ADMIN_ALLOWED_TRANSITIONS } from "@/lib/statusConfig";
import { UKPlate } from "@/components/UKPlate";
import { PhotoViewer } from "@/components/PhotoViewer";
import { resolveMediaUrlAsync } from "@/lib/mediaResolver";

// ── Helpers ──────────────────────────────────────────────────────────

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function mapsNavUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function buildFullAddress(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

function derivePrimaryCta(
  status: string,
  hasPickup: boolean,
  hasDelivery: boolean,
): { label: string; route: (id: string) => string } {
  if (!hasPickup) return { label: "Start Pickup", route: (id) => `/inspection/${id}/pickup` };
  switch (status) {
    case "ready_for_pickup":
    case "assigned":
      return { label: "Start Pickup", route: (id) => `/inspection/${id}/pickup` };
    case "pickup_in_progress":
      return { label: "Continue Pickup", route: (id) => `/inspection/${id}/pickup` };
    case "pickup_complete":
    case "in_transit":
      return hasDelivery
        ? { label: "View POD", route: (id) => `/jobs/${id}/pod` }
        : { label: "Start Delivery", route: (id) => `/inspection/${id}/delivery` };
    case "delivery_in_progress":
      return { label: "Confirm Delivery", route: (id) => `/inspection/${id}/delivery` };
    default:
      return { label: "View POD", route: (id) => `/jobs/${id}/pod` };
  }
}

// ── Workflow Progress ────────────────────────────────────────────────

type WorkflowStep = "pickup" | "transit" | "delivery";
const STEPS: WorkflowStep[] = ["pickup", "transit", "delivery"];
const STEP_LABELS: Record<WorkflowStep, string> = { pickup: "Pickup", transit: "Transit", delivery: "Delivery" };

function deriveActiveStep(status: string): WorkflowStep | null {
  switch (status) {
    case "ready_for_pickup": case "assigned": case "pickup_in_progress": return "pickup";
    case "pickup_complete": case "in_transit": return "transit";
    case "delivery_in_progress": return "delivery";
    default: return null;
  }
}

function isStepComplete(step: WorkflowStep, status: string): boolean {
  const order: Record<WorkflowStep, number> = { pickup: 0, transit: 1, delivery: 2 };
  const completedUpTo: Record<string, number> = {
    pickup_complete: 0, in_transit: 0, delivery_in_progress: 1,
    delivery_complete: 2, pod_ready: 2, completed: 2,
  };
  const threshold = completedUpTo[status];
  return threshold !== undefined && order[step] <= threshold;
}

// ── Component ────────────────────────────────────────────────────────

export const JobDetail = () => {
  const navigate = useNavigate();
  const goBack = useSafeBack("/jobs");
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const { data: job, isLoading } = useJob(jobId ?? "");
  const { data: jobExpenses } = useJobExpenses(jobId ?? "");
  const { isAdmin, isSuperAdmin } = useAuth();
  const deleteJob = useDeleteJob();
  const changeStatus = useAdminChangeStatus();
  const canAdmin = isAdmin || isSuperAdmin;

  const [qrConfirmations, setQrConfirmations] = useState<QrConfirmation[]>([]);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [qrModal, setQrModal] = useState<{ open: boolean; url: string; eventType: string }>({ open: false, url: "", eventType: "" });
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [changingStatus, setChangingStatus] = useState(false);
  const [resolvedPhotos, setResolvedPhotos] = useState<Record<string, string>>({});
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoRetryCount, setPhotoRetryCount] = useState(0);

  // Resolve photos for admin gallery — with automatic retry for failures
  useEffect(() => {
    if (!canAdmin || !job?.photos?.length) return;
    let cancelled = false;
    setPhotosLoading(true);

    const resolveWithRetry = async () => {
      const allPhotos = job.photos as any[];
      const failed: any[] = [];

      // First pass
      await Promise.all(
        allPhotos.map(async (p: any) => {
          try {
            const resolved = await resolveMediaUrlAsync(p.url);
            if (!cancelled && resolved) {
              setResolvedPhotos(prev => ({ ...prev, [p.id]: resolved }));
            } else if (!cancelled) {
              failed.push(p);
            }
          } catch {
            if (!cancelled) failed.push(p);
          }
        })
      );

      // Retry pass after 2s for any failures
      if (failed.length > 0 && !cancelled) {
        console.info('[JobDetail] Retrying ' + failed.length + ' failed photos');
        await new Promise(r => setTimeout(r, 2000));
        await Promise.all(
          failed.map(async (p: any) => {
            try {
              const resolved = await resolveMediaUrlAsync(p.url);
              if (!cancelled && resolved) {
                setResolvedPhotos(prev => ({ ...prev, [p.id]: resolved }));
              } else if (!cancelled) {
                console.warn('[JobDetail] Photo failed after retry', { id: p.id, url: (p.url || '').slice(0, 80) });
              }
            } catch {
              if (!cancelled) {
                console.warn('[JobDetail] Photo exception after retry', { id: p.id });
              }
            }
          })
        );
      }

      if (!cancelled) setPhotosLoading(false);
    };

    void resolveWithRetry();
    return () => { cancelled = true; };
  }, [job?.photos, canAdmin, photoRetryCount]);

  const handleRetryPhotos = () => setPhotoRetryCount(c => c + 1);

  const handleDeleteJob = async () => {
    if (!jobId) return;
    try {
      await deleteJob.mutateAsync(jobId);
      toast({ title: "Job deleted" });
      navigate("/jobs", { replace: true });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const handleChangeStatus = async () => {
    if (!jobId || !selectedStatus || changingStatus) return;
    setChangingStatus(true);
    try {
      await changeStatus.mutateAsync({ jobId, newStatus: selectedStatus });
      toast({ title: `Status changed to ${selectedStatus.replace(/_/g, " ")}` });
      setSelectedStatus("");
    } catch (e: any) {
      toast({ title: "Status change failed", description: e.message, variant: "destructive" });
    } finally {
      setChangingStatus(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    getQrConfirmationsForJob(jobId).then(setQrConfirmations).catch(() => {});
  }, [jobId]);

  const handleGenerateQr = async (eventType: "collection" | "delivery") => {
    if (!jobId) return;
    setGeneratingQr(true);
    try {
      const qr = await createQrConfirmation(jobId, eventType);
      setQrConfirmations((prev) => [qr, ...prev]);
      setQrModal({ open: true, url: buildQrUrl(qr.token), eventType });
    } catch {
      toast({ title: "QR generation failed. Please try again.", variant: "destructive" });
    } finally {
      setGeneratingQr(false);
    }
  };

  // ── Loading / Error ──
  if (isLoading || !job) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <AppHeader title="Job Detail" showBack onBack={goBack} />
        <div className="p-4"><DashboardSkeleton /></div>
        <BottomNav />
      </div>
    );
  }

  const jobRef = job.external_job_number || job.id.slice(0, 8);
  const statusStyle = getStatusStyle(job.status);
  const pickupInspection = job.inspections.find((i) => i.type === "pickup");
  const deliveryInspection = job.inspections.find((i) => i.type === "delivery");
  const primaryCta = derivePrimaryCta(job.status, job.has_pickup_inspection, job.has_delivery_inspection);
  const activeStep = deriveActiveStep(job.status);
  const execEval = evaluateExecutableState(job);
  const isBlocked = execEval.state === "blocked";
  const isReviewOnly = execEval.state === "review_only";

  const pickupAddr = buildFullAddress([job.pickup_address_line1, job.pickup_address_line2, job.pickup_city, job.pickup_postcode]);
  const deliveryAddr = buildFullAddress([job.delivery_address_line1, job.delivery_address_line2, job.delivery_city, job.delivery_postcode]);

  // Restrictions / alerts
  const restrictions: string[] = [];
  if (job.earliest_delivery_date) restrictions.push(`Do not deliver before ${job.earliest_delivery_date}`);
  if (job.caz_ulez_flag) restrictions.push(`CAZ/ULEZ: ${job.caz_ulez_flag}`);

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title={`Job ${jobRef}`} showBack onBack={goBack} />

      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {/* ── 1. HEADER ── */}
        <Section>
          <div className="flex items-center justify-between mb-3">
            <span
              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
              className="inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold uppercase leading-none"
            >
              {statusStyle.label}
            </span>
            <UKPlate reg={job.vehicle_reg} />
          </div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-sm font-semibold text-foreground">Job {jobRef}</p>
            <EvidenceStatusBadges jobId={job.id} />
          </div>
          <p className="text-sm text-foreground mt-0.5">
            {job.vehicle_make} {job.vehicle_model}
            <span className="text-muted-foreground"> — </span>
            <span className="text-foreground">{job.vehicle_colour}</span>
            {job.vehicle_year && <span className="text-muted-foreground"> ({job.vehicle_year})</span>}
          </p>

          {/* Client profile */}
          {(job.client_company || job.client_name) && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Building className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {job.client_company || job.client_name}
                {job.client_email && ` · ${job.client_email}`}
              </span>
            </div>
          )}

          {/* Workflow progress */}
          {activeStep && (
            <div className="flex items-center gap-1 mt-3">
              {STEPS.map((step) => {
                const complete = isStepComplete(step, job.status);
                const active = step === activeStep;
                return (
                  <div key={step} className="flex flex-col items-center flex-1">
                    <div
                      className={`h-1.5 w-full rounded-full ${
                        complete ? "bg-success" : active ? "bg-primary" : "bg-muted"
                      }`}
                    />
                    <span
                      className={`text-[9px] mt-0.5 font-medium ${
                        complete ? "text-success" : active ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── 2. ALERT STRIP ── */}
        {restrictions.length > 0 && (
          <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl space-y-1">
            {restrictions.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                <span className="text-xs text-warning font-medium leading-snug">{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── 3. PICKUP ── */}
        <Section>
          <SectionLabel>Collect From</SectionLabel>
          <ContactRow icon={Building} text={job.pickup_contact_name} />
          {job.pickup_company && (
            <span className="text-xs text-foreground/70 pl-6 font-medium">{job.pickup_company}</span>
          )}
          <ContactRow icon={Phone} text={job.pickup_contact_phone} href={`tel:${job.pickup_contact_phone}`} />
          <ContactRow icon={MapPin} text={pickupAddr} href={mapsUrl(pickupAddr)} external />
          {job.pickup_time_from && (
            <p className="text-xs text-foreground/70 pl-6">
              Time: {job.pickup_time_from}{job.pickup_time_to ? ` – ${job.pickup_time_to}` : ""}
            </p>
          )}
          {job.pickup_notes && <NoteStrip text={job.pickup_notes} />}
          {job.pickup_access_notes && <NoteStrip text={`Access: ${job.pickup_access_notes}`} />}
          {/* Navigate action */}
          <Button
            variant="outline"
            size="sm"
            className="mt-2 min-h-[44px] w-full rounded-lg"
            onClick={() => window.open(mapsNavUrl(pickupAddr), "_blank")}
          >
            <Navigation className="h-4 w-4 mr-1.5" /> Navigate to Pickup
          </Button>
        </Section>

        {/* ── 4. DELIVERY ── */}
        <Section>
          <SectionLabel>Deliver To</SectionLabel>
          <ContactRow icon={Building} text={job.delivery_contact_name} />
          {job.delivery_company && (
            <span className="text-xs text-foreground/70 pl-6 font-medium">{job.delivery_company}</span>
          )}
          <ContactRow icon={Phone} text={job.delivery_contact_phone} href={`tel:${job.delivery_contact_phone}`} />
          <ContactRow icon={MapPin} text={deliveryAddr} href={mapsUrl(deliveryAddr)} external />
          {job.delivery_time_from && (
            <p className="text-xs text-foreground/70 pl-6">
              Time: {job.delivery_time_from}{job.delivery_time_to ? ` – ${job.delivery_time_to}` : ""}
            </p>
          )}
          {job.delivery_notes && <NoteStrip text={job.delivery_notes} />}
          {job.delivery_access_notes && <NoteStrip text={`Access: ${job.delivery_access_notes}`} />}
          <Button
            variant="outline"
            size="sm"
            className="mt-2 min-h-[44px] w-full rounded-lg"
            onClick={() => window.open(mapsNavUrl(deliveryAddr), "_blank")}
          >
            <Navigation className="h-4 w-4 mr-1.5" /> Navigate to Delivery
          </Button>
        </Section>

        {/* ── 5. INSPECTIONS ── */}
        <Section>
          <SectionLabel>Inspections</SectionLabel>
          <InspectionRow
            label="Pickup Inspection"
            done={!!pickupInspection}
            onAction={() => navigate(withFrom(`/inspection/${job.id}/pickup`, searchParams))}
            actionIcon={ClipboardCheck}
            warning={isBlocked ? execEval.reason : undefined}
          />
          <InspectionRow
            label="Delivery Inspection"
            done={!!deliveryInspection}
            onAction={() => navigate(withFrom(`/inspection/${job.id}/delivery`, searchParams))}
            actionIcon={Truck}
            warning={isBlocked || isReviewOnly ? (execEval.reason || "Awaiting review") : undefined}
          />
        </Section>

        {/* ── 6. QR HANDOVER ── */}
        <Section>
          <SectionLabel icon={QrCode}>QR Handover</SectionLabel>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleGenerateQr("collection")} disabled={generatingQr} className="min-h-[44px] rounded-lg flex-1">
              Collection QR
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleGenerateQr("delivery")} disabled={generatingQr} className="min-h-[44px] rounded-lg flex-1">
              Delivery QR
            </Button>
          </div>
          {qrConfirmations.length > 0 && (
            <div className="space-y-1 mt-2">
              {qrConfirmations.map((qr) => (
                <div key={qr.id} className="flex justify-between items-center text-xs py-1">
                  <span className="text-muted-foreground capitalize">{qr.event_type}</span>
                  {qr.confirmed_at ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-success text-success-foreground">
                      ✓ {qr.customer_name} – {new Date(qr.confirmed_at).toLocaleString("en-GB")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border border-border text-muted-foreground">
                      Pending
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── 7. NOTES ── */}
        {job.job_notes && (
          <Section>
            <SectionLabel>Job Notes</SectionLabel>
            <p className="text-xs text-muted-foreground leading-relaxed">{job.job_notes}</p>
          </Section>
        )}

        {/* ── 8. ACTIONS ── */}
        <div className="space-y-2 pb-4">
          {/* Executable state banner */}
          {(isBlocked || isReviewOnly) && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/60 border border-border">
              <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-medium">
                {isBlocked ? `Blocked: ${execEval.reason}` : execEval.reason}
              </span>
            </div>
          )}

          {/* Primary CTA — hidden for blocked, view-only for review */}
          {!isBlocked && (
            <Button
              className="w-full min-h-[44px] rounded-lg"
              variant={isReviewOnly ? "outline" : "default"}
              onClick={() => navigate(
                isReviewOnly
                  ? withFrom(`/jobs/${job.id}/pod`, searchParams)
                  : primaryCta.route(job.id)
              )}
            >
              {isReviewOnly ? "View POD" : primaryCta.label}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}

          {/* Secondary: Expenses */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 min-h-[44px] rounded-lg" onClick={() => navigate(withFrom(`/expenses?jobId=${job.id}`, searchParams))}>
              <Receipt className="h-4 w-4 mr-1.5" />
              Expenses{jobExpenses?.length ? ` (${jobExpenses.length})` : ""}
            </Button>
            {(job.has_pickup_inspection || job.has_delivery_inspection) && (
              <Button variant="outline" size="sm" className="flex-1 min-h-[44px] rounded-lg" onClick={() => navigate(withFrom(`/jobs/${job.id}/pod`, searchParams))}>
                <FileText className="h-4 w-4 mr-1.5" /> POD Report
              </Button>
            )}
          </div>

          {/* Admin-only: Edit + Delete + Status Change */}
          {canAdmin && (
            <div className="space-y-2">
              <Button variant="outline" className="w-full min-h-[44px] rounded-lg" onClick={() => navigate(withFrom(`/jobs/${job.id}/edit`, searchParams))}>
                <Edit className="h-4 w-4 mr-1.5" /> Edit Job
              </Button>

              {/* Status Change */}
              {ADMIN_ALLOWED_TRANSITIONS[job.status]?.length > 0 && (
                <div className="flex gap-2">
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="flex-1 min-h-[44px] rounded-lg">
                      <SelectValue placeholder="Change status…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ADMIN_ALLOWED_TRANSITIONS[job.status].map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="min-h-[44px] min-w-[44px] rounded-lg"
                    disabled={!selectedStatus || changingStatus}
                    onClick={handleChangeStatus}
                  >
                    {changingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
              )}

              {/* Delete Job */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full min-h-[44px] rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4 mr-1.5" /> Delete Job
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this job?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will archive the job and remove it from all active lists. This action can be undone by a super admin.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteJob} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Admin Photos Section */}
          {canAdmin && job.photos && job.photos.length > 0 && (
            <Section>
              <SectionLabel icon={Images}>Inspection Photos</SectionLabel>
              {photosLoading && (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading photos…</span>
                </div>
              )}
              <PhotoViewer
                title="Collection"
                totalExpected={job.photos.filter((p: any) => p.type.startsWith("pickup_")).length}
                onRetry={handleRetryPhotos}
                photos={job.photos
                  .filter((p: any) => p.type.startsWith("pickup_"))
                  .map((p: any) => ({
                    url: resolvedPhotos[p.id] || "",
                    label: p.label || p.type.replace("pickup_", "").replace(/_/g, " "),
                  }))
                  .filter((p: any) => !!p.url)}
              />
              <PhotoViewer
                title="Delivery"
                totalExpected={job.photos.filter((p: any) => p.type.startsWith("delivery_")).length}
                onRetry={handleRetryPhotos}
                photos={job.photos
                  .filter((p: any) => p.type.startsWith("delivery_"))
                  .map((p: any) => ({
                    url: resolvedPhotos[p.id] || "",
                    label: p.label || p.type.replace("delivery_", "").replace(/_/g, " "),
                  }))
                  .filter((p: any) => !!p.url)}
              />
              <PhotoViewer
                title="Damage"
                totalExpected={job.photos.filter((p: any) => p.type === "damage_close_up").length}
                onRetry={handleRetryPhotos}
                photos={job.photos
                  .filter((p: any) => p.type === "damage_close_up")
                  .map((p: any) => ({
                    url: resolvedPhotos[p.id] || "",
                    label: p.label || "Damage",
                  }))
                  .filter((p: any) => !!p.url)}
              />
            </Section>
          )}
        </div>
      </div>

      <QrDisplayModal
        isOpen={qrModal.open}
        onClose={() => setQrModal((prev) => ({ ...prev, open: false }))}
        url={qrModal.url}
        eventType={qrModal.eventType}
        jobRef={jobRef}
      />
      <BottomNav />
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-2">
      {children}
    </div>
  );
}

function SectionLabel({ children, icon: Icon }: { children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <h3 className="text-[14px] font-semibold text-muted-foreground flex items-center gap-1.5 mb-1">
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </h3>
  );
}

function ContactRow({
  icon: Icon,
  text,
  href,
  external,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  href?: string;
  external?: boolean;
}) {
  const content = href ? (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="text-sm text-primary hover:underline underline-offset-2"
    >
      {text}
    </a>
  ) : (
    <span className="text-sm text-foreground">{text}</span>
  );

  return (
    <div className="flex items-start gap-2 min-h-[36px]">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      {content}
    </div>
  );
}

function NoteStrip({ text }: { text: string }) {
  return (
    <p className="text-xs text-muted-foreground italic pl-6 leading-snug">{text}</p>
  );
}

function InspectionRow({
  label,
  done,
  onAction,
  actionIcon: ActionIcon,
  warning,
}: {
  label: string;
  done: boolean;
  onAction?: () => void;
  actionIcon: React.ComponentType<{ className?: string }>;
  warning?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  const handleAction = () => {
    if (warning && !dismissed) {
      setDismissed(true);
      toast({ title: `⚠️ ${warning}`, description: "Tap again to proceed anyway." });
      return;
    }
    onAction?.();
  };

  return (
    <div className="flex items-center justify-between min-h-[44px]">
      <div className="flex flex-col">
        <span className="text-sm text-foreground">{label}</span>
        {warning && !dismissed && (
          <span className="text-[10px] text-warning font-medium flex items-center gap-0.5">
            <AlertTriangle className="h-2.5 w-2.5" /> {warning}
          </span>
        )}
      </div>
      {done ? (
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase leading-none bg-success text-success-foreground">
          Complete
        </span>
      ) : onAction ? (
        <Button size="sm" onClick={handleAction} variant={warning && !dismissed ? "outline" : "default"} className="min-h-[44px] rounded-lg">
          <ActionIcon className="w-4 h-4 mr-1" /> {warning && !dismissed ? "Override" : "Start"}
        </Button>
      ) : null}
    </div>
  );
}
