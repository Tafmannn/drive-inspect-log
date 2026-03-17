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
 */

import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { resolveBackTarget, withFrom } from "@/lib/navigationUtils";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { useJob } from "@/hooks/useJobs";
import { useJobExpenses } from "@/hooks/useExpenses";
import {
  Phone, MapPin, Building, Edit, ClipboardCheck, Truck,
  FileText, Receipt, QrCode, Navigation, AlertTriangle, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { createQrConfirmation, getQrConfirmationsForJob, buildQrUrl, type QrConfirmation } from "@/lib/qrApi";
import { QrDisplayModal } from "@/components/QrDisplayModal";
import { useAuth } from "@/context/AuthContext";
import { getStatusStyle } from "@/lib/statusConfig";
import { UKPlate } from "@/components/UKPlate";

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
  const { jobId } = useParams<{ jobId: string }>();
  const { data: job, isLoading } = useJob(jobId ?? "");
  const { data: jobExpenses } = useJobExpenses(jobId ?? "");
  const { isAdmin } = useAuth();

  const [qrConfirmations, setQrConfirmations] = useState<QrConfirmation[]>([]);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [qrModal, setQrModal] = useState<{ open: boolean; url: string; eventType: string }>({ open: false, url: "", eventType: "" });

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
        <AppHeader title="Job Detail" showBack onBack={() => navigate("/jobs")} />
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

  const pickupAddr = buildFullAddress([job.pickup_address_line1, job.pickup_address_line2, job.pickup_city, job.pickup_postcode]);
  const deliveryAddr = buildFullAddress([job.delivery_address_line1, job.delivery_address_line2, job.delivery_city, job.delivery_postcode]);

  // Restrictions / alerts
  const restrictions: string[] = [];
  if (job.earliest_delivery_date) restrictions.push(`Do not deliver before ${job.earliest_delivery_date}`);
  if (job.caz_ulez_flag) restrictions.push(`CAZ/ULEZ: ${job.caz_ulez_flag}`);

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title={`Job ${jobRef}`} showBack onBack={() => navigate("/jobs")} />

      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {/* ── 1. HEADER ── */}
        <Section>
          <div className="flex items-center justify-between mb-2">
            <span
              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
              className="inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold uppercase leading-none"
            >
              {statusStyle.label}
            </span>
            <UKPlate reg={job.vehicle_reg} />
          </div>
          <p className="text-sm font-medium text-primary">Job {jobRef}</p>
          <p className="text-xs text-muted-foreground">
            {job.vehicle_make} {job.vehicle_model} — {job.vehicle_colour}
            {job.vehicle_year && ` (${job.vehicle_year})`}
          </p>

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
            <span className="text-xs text-muted-foreground pl-6">{job.pickup_company}</span>
          )}
          <ContactRow icon={Phone} text={job.pickup_contact_phone} href={`tel:${job.pickup_contact_phone}`} />
          <ContactRow icon={MapPin} text={pickupAddr} href={mapsUrl(pickupAddr)} external />
          {job.pickup_time_from && (
            <p className="text-xs text-muted-foreground pl-6">
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
            <span className="text-xs text-muted-foreground pl-6">{job.delivery_company}</span>
          )}
          <ContactRow icon={Phone} text={job.delivery_contact_phone} href={`tel:${job.delivery_contact_phone}`} />
          <ContactRow icon={MapPin} text={deliveryAddr} href={mapsUrl(deliveryAddr)} external />
          {job.delivery_time_from && (
            <p className="text-xs text-muted-foreground pl-6">
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
            onAction={() => navigate(`/inspection/${job.id}/pickup`)}
            actionIcon={ClipboardCheck}
          />
          <InspectionRow
            label="Delivery Inspection"
            done={!!deliveryInspection}
            onAction={() => navigate(`/inspection/${job.id}/delivery`)}
            actionIcon={Truck}
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
          {/* Primary CTA */}
          <Button
            className="w-full min-h-[44px] rounded-lg"
            onClick={() => navigate(primaryCta.route(job.id))}
          >
            {primaryCta.label}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>

          {/* Secondary: Expenses */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 min-h-[44px] rounded-lg" onClick={() => navigate(`/expenses?jobId=${job.id}`)}>
              <Receipt className="h-4 w-4 mr-1.5" />
              Expenses{jobExpenses?.length ? ` (${jobExpenses.length})` : ""}
            </Button>
            {(job.has_pickup_inspection || job.has_delivery_inspection) && (
              <Button variant="outline" size="sm" className="flex-1 min-h-[44px] rounded-lg" onClick={() => navigate(`/jobs/${job.id}/pod`)}>
                <FileText className="h-4 w-4 mr-1.5" /> POD Report
              </Button>
            )}
          </div>

          {/* Admin-only: Edit */}
          {isAdmin && (
            <Button variant="outline" className="w-full min-h-[44px] rounded-lg" onClick={() => navigate(`/jobs/${job.id}/edit`)}>
              <Edit className="h-4 w-4 mr-1.5" /> Edit Job
            </Button>
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
}: {
  label: string;
  done: boolean;
  onAction: () => void;
  actionIcon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between min-h-[44px]">
      <span className="text-sm text-foreground">{label}</span>
      {done ? (
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase leading-none bg-success text-success-foreground">
          Complete
        </span>
      ) : (
        <Button size="sm" onClick={onAction} className="min-h-[44px] rounded-lg">
          <ActionIcon className="w-4 h-4 mr-1" /> Start
        </Button>
      )}
    </div>
  );
}
