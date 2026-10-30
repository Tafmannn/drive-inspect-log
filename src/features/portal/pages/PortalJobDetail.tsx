import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Loader2, MapPin, PenLine, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortalEvidence, usePortalJob, type PortalEvidence, type PortalInspection } from "../api";
import { STAGE_LABEL, portalStage, timelineSteps } from "../lib/portalStatus";
import { StageBadge, StageProgress } from "../components/PortalStatus";

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function humanise(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Address({ title, lines, contact }: { title: string; lines: (string | null)[]; contact: string | null }) {
  return (
    <div className="space-y-0.5 min-w-0">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      {lines.filter(Boolean).map((l, i) => <p key={i} className="text-sm">{l}</p>)}
      {contact && <p className="text-xs text-muted-foreground pt-1">Contact: {contact}</p>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}

function InspectionSection({
  inspection,
  evidence,
  evidenceLoading,
}: {
  inspection: PortalInspection;
  evidence: PortalEvidence | undefined;
  evidenceLoading: boolean;
}) {
  const title = inspection.type === "pickup" ? "Collection report" : inspection.type === "delivery" ? "Delivery report" : humanise(inspection.type);
  const photos = (evidence?.photos ?? []).filter((p) => p.inspection_type === inspection.type);
  const signatures = (evidence?.signatures ?? []).filter((s) => s.inspection_type === inspection.type);

  return (
    <Card className="break-inside-avoid">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {fmtDateTime(inspection.inspected_at)}
          {inspection.inspected_by_name ? ` · Inspected by ${inspection.inspected_by_name}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Fact label="Odometer" value={inspection.odometer != null ? `${inspection.odometer.toLocaleString("en-GB")} mi` : null} />
          <Fact label="Fuel / charge" value={inspection.fuel_level_percent != null ? `${inspection.fuel_level_percent}%` : null} />
          <Fact label="Keys" value={inspection.number_of_keys} />
          <Fact label={inspection.type === "delivery" ? "Received by" : "Handed over by"} value={inspection.customer_name} />
        </div>

        {inspection.notes && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{inspection.notes}</p>
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-1">Damage recorded</p>
          {inspection.damage.length === 0 ? (
            <p className="text-sm">{inspection.has_damage ? "Damage noted — see photos." : "No damage recorded."}</p>
          ) : (
            <ul className="space-y-1">
              {inspection.damage.map((d, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <TriangleAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <span>
                    {[humanise(d.area), humanise(d.location), humanise(d.item)].filter(Boolean).join(" · ")}
                    {d.damage_types?.length ? ` — ${d.damage_types.map(humanise).join(", ")}` : ""}
                    {d.notes ? ` (${d.notes})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> Photos</p>
          {evidenceLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos available.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block group">
                  <img
                    src={p.url}
                    alt={p.label || humanise(p.type)}
                    loading="lazy"
                    className="aspect-square w-full object-cover rounded-md border border-border group-hover:opacity-90"
                  />
                  <p className="mt-0.5 text-[10px] text-muted-foreground truncate">{p.label || humanise(p.type.replace(/^(pickup|delivery)_/, ""))}</p>
                </a>
              ))}
            </div>
          )}
        </div>

        {signatures.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><PenLine className="w-3.5 h-3.5" /> Signatures</p>
            <div className="flex flex-wrap gap-4">
              {signatures.map((s) => (
                <figure key={s.signer} className="space-y-1">
                  <img src={s.url} alt={`${s.signer} signature`} className="h-16 w-auto max-w-[220px] bg-white rounded border border-border p-1" />
                  <figcaption className="text-xs text-muted-foreground capitalize">{s.signer}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data, isLoading, error } = usePortalJob(jobId);
  const hasInspections = (data?.inspections.length ?? 0) > 0;
  const { data: evidence, isLoading: evidenceLoading } = usePortalEvidence(jobId, hasInspections);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center space-y-3">
        <p className="text-sm font-medium">This vehicle move couldn't be found.</p>
        <Button variant="outline" asChild><Link to="/portal">Back to vehicle moves</Link></Button>
      </div>
    );
  }

  const { job, timeline, inspections } = data;
  const stage = portalStage(job.status);
  const steps = timelineSteps(timeline);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/portal"><ArrowLeft className="w-4 h-4 mr-1" /> All moves</Link>
        </Button>
        {hasInspections && (
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1.5" /> Print / save as PDF
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-mono text-xl font-semibold tracking-wide">{job.vehicle_reg}</h1>
              <p className="text-sm text-muted-foreground">
                {[job.vehicle_year, job.vehicle_make, job.vehicle_model, job.vehicle_colour].filter(Boolean).join(" · ") || "Vehicle"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Reference {job.job_ref}</p>
            </div>
            <StageBadge stage={stage} />
          </div>
          <StageProgress stage={stage} />
          <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border">
            <Address
              title="Collection"
              lines={[job.pickup_address_line1, job.pickup_address_line2, [job.pickup_city, job.pickup_postcode].filter(Boolean).join(" ")]}
              contact={job.pickup_contact_name}
            />
            <Address
              title="Delivery"
              lines={[job.delivery_address_line1, job.delivery_address_line2, [job.delivery_city, job.delivery_postcode].filter(Boolean).join(" ")]}
              contact={job.delivery_contact_name}
            />
          </div>
        </CardContent>
      </Card>

      {steps.length > 0 && (
        <Card className="break-inside-avoid">
          <CardHeader className="pb-2"><CardTitle className="text-base">Progress</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={`${s.stage}-${i}`} className="flex items-center gap-3 text-sm">
                  <MapPin className={i === steps.length - 1 ? "w-4 h-4 text-primary" : "w-4 h-4 text-muted-foreground"} />
                  <span className="font-medium w-36 shrink-0">{STAGE_LABEL[s.stage]}</span>
                  <span className="text-muted-foreground">{fmtDateTime(s.at)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {inspections.map((i) => (
        <InspectionSection key={i.type} inspection={i} evidence={evidence} evidenceLoading={evidenceLoading} />
      ))}

      {evidence && evidence.unavailable > 0 && (
        <p className="text-xs text-muted-foreground print:hidden">
          {evidence.unavailable} older item{evidence.unavailable === 1 ? "" : "s"} of evidence can't be shown online —
          contact your transport provider for a copy.
        </p>
      )}
    </div>
  );
}
