/**
 * EvidenceHealthBanner — unified ops-intelligence banner used by POD Report,
 * Invoice Prep, and any admin surface that surfaces blockers/warnings from
 * podReadiness / evidenceHealth / invoiceReadiness.
 *
 * Pure presentational. Pass blockers + warnings + an overall level. Render
 * inside <RoleScope admin> at the call site if it's admin-only.
 */
import type { ReactNode } from "react";
import { ShieldAlert, AlertTriangle, CheckCircle2, ShieldCheck, Undo2 } from "lucide-react";
import {
  SectionCard,
  SectionHeader,
  StatusPill,
  WarningCallout,
  RoleScope,
  type StatusPillTone,
} from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

export type EvidenceLevel = "green" | "amber" | "red" | "critical";

interface BannerItem {
  /** Stable key (e.g. blocker code). */
  code: string;
  message: string;
}

interface EvidenceHealthBannerProps {
  level: EvidenceLevel;
  title?: string;
  blockers?: BannerItem[];
  warnings?: BannerItem[];
  /** Optional small right-aligned summary, e.g. "3 pickup · 2 delivery · 0 dup". */
  summary?: ReactNode;
  /** Optional footer strip, e.g. "Safe to approve: Yes · Safe to close: No". */
  footer?: ReactNode;
  /** When true, hide entirely on `green` (use for advisory mode). */
  hideWhenGreen?: boolean;
  className?: string;
  /**
   * Admin override (UI-only). When `onAcknowledge` is provided, each active
   * blocker renders an "Acknowledge" action visible to admins. Acknowledged
   * codes are moved into a muted strip and visually downgrade red→amber.
   * The banner does NOT alter readiness logic itself — call sites decide
   * how to combine `acknowledgedCodes` with their own readiness flags.
   */
  acknowledgedCodes?: string[];
  onAcknowledge?: (code: string) => void;
  onUnacknowledge?: (code: string) => void;
  /** Optional extra label for the override action (default: "Acknowledge"). */
  overrideLabel?: string;
}

const LEVEL_TONE: Record<EvidenceLevel, StatusPillTone> = {
  green: "success",
  amber: "warning",
  red: "danger",
  critical: "danger",
};

const LEVEL_ICON: Record<EvidenceLevel, ReactNode> = {
  green: <CheckCircle2 className="h-4 w-4" />,
  amber: <AlertTriangle className="h-4 w-4" />,
  red: <ShieldAlert className="h-4 w-4" />,
  critical: <ShieldAlert className="h-4 w-4" />,
};

const LEVEL_LABEL: Record<EvidenceLevel, string> = {
  green: "Healthy",
  amber: "Needs attention",
  red: "Blocked",
  critical: "Critical",
};

export function EvidenceHealthBanner({
  level,
  title = "Evidence Health",
  blockers = [],
  warnings = [],
  summary,
  footer,
  hideWhenGreen,
  className,
  acknowledgedCodes = [],
  onAcknowledge,
  onUnacknowledge,
  overrideLabel = "Acknowledge",
}: EvidenceHealthBannerProps) {
  const ackSet = new Set(acknowledgedCodes);
  const activeBlockers = blockers.filter((b) => !ackSet.has(b.code));
  const ackBlockers = blockers.filter((b) => ackSet.has(b.code));

  // Visual downgrade: if the source said red/critical but every blocker has
  // been acknowledged by an admin, present the banner one tone lighter.
  // The underlying readiness flags are unchanged — the call site decides
  // what to unlock.
  const allAcknowledged = blockers.length > 0 && activeBlockers.length === 0;
  const effectiveLevel: EvidenceLevel = allAcknowledged && (level === "red" || level === "critical")
    ? "amber"
    : level;

  if (hideWhenGreen && effectiveLevel === "green" && blockers.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <SectionCard className={className}>
      <SectionHeader
        icon={LEVEL_ICON[effectiveLevel]}
        eyebrow="Operational health"
        title={title}
        right={
          <>
            <StatusPill tone={LEVEL_TONE[effectiveLevel]}>{LEVEL_LABEL[effectiveLevel]}</StatusPill>
            {allAcknowledged && (
              <StatusPill tone="info" aria-label="Admin override active">
                Override
              </StatusPill>
            )}
            {summary && (
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                {summary}
              </span>
            )}
          </>
        }
      />

      {summary && (
        <p className="text-[11px] text-muted-foreground sm:hidden">{summary}</p>
      )}

      {activeBlockers.length > 0 && (
        <div className="space-y-1.5">
          {activeBlockers.map((b) => (
            <WarningCallout
              key={`b-${b.code}`}
              severity="critical"
              action={
                onAcknowledge ? (
                  <RoleScope admin>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] gap-1 shrink-0"
                      onClick={() => onAcknowledge(b.code)}
                      aria-label={`${overrideLabel} blocker ${b.code}`}
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {overrideLabel}
                    </Button>
                  </RoleScope>
                ) : undefined
              }
            >
              {b.message}
            </WarningCallout>
          ))}
        </div>
      )}

      {ackBlockers.length > 0 && (
        <div className="space-y-1 rounded-md border border-dashed border-border bg-muted/40 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Acknowledged by admin ({ackBlockers.length})
          </p>
          <ul className="space-y-1">
            {ackBlockers.map((b) => (
              <li
                key={`ack-${b.code}`}
                className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
              >
                <span className="truncate">{b.message}</span>
                {onUnacknowledge && (
                  <RoleScope admin>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px] gap-1 shrink-0"
                      onClick={() => onUnacknowledge(b.code)}
                      aria-label={`Undo override for ${b.code}`}
                    >
                      <Undo2 className="h-3 w-3" />
                      Undo
                    </Button>
                  </RoleScope>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((w) => (
            <WarningCallout key={`w-${w.code}`} severity="warning">
              {w.message}
            </WarningCallout>
          ))}
        </div>
      )}

      {footer && (
        <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
          {footer}
        </div>
      )}
    </SectionCard>
  );
}

