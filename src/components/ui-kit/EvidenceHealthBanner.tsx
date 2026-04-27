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
}: EvidenceHealthBannerProps) {
  if (hideWhenGreen && level === "green" && blockers.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <SectionCard className={className}>
      <SectionHeader
        icon={LEVEL_ICON[level]}
        eyebrow="Operational health"
        title={title}
        right={
          <>
            <StatusPill tone={LEVEL_TONE[level]}>{LEVEL_LABEL[level]}</StatusPill>
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

      {blockers.length > 0 && (
        <div className="space-y-1.5">
          {blockers.map((b) => (
            <WarningCallout key={`b-${b.code}`} severity="critical">
              {b.message}
            </WarningCallout>
          ))}
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
