/**
 * ComplianceDigest – Grouped per-entity rollup of compliance alerts.
 * Each row shows entity name, expired/expiring/missing tallies, and routes to the profile.
 */
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { CompactTable, type CompactColumn } from "@/features/control/components/shared/CompactTable";
import { ControlSection } from "@/features/control/components/shared/ControlShell";
import { User, Building2, Briefcase, AlertCircle } from "lucide-react";
import {
  groupComplianceDigest,
  type DigestGroup,
} from "@/features/attention/lib/complianceDigest";
import type { AttentionException } from "@/features/attention/types/exceptionTypes";

interface ComplianceDigestProps {
  exceptions: AttentionException[];
  loading?: boolean;
}

const ENTITY_ICON: Record<DigestGroup["entityType"], typeof User> = {
  driver: User,
  client: Briefcase,
  organisation: Building2,
  other: AlertCircle,
};

const ENTITY_LABEL: Record<DigestGroup["entityType"], string> = {
  driver: "Driver",
  client: "Client",
  organisation: "Organisation",
  other: "Other",
};

const columns: CompactColumn<DigestGroup>[] = [
  {
    key: "entity",
    header: "Affected",
    render: (g) => {
      const Icon = ENTITY_ICON[g.entityType];
      return (
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">{g.entityName}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {ENTITY_LABEL[g.entityType]}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    key: "issues",
    header: "Issues",
    className: "w-[180px]",
    render: (g) => (
      <div className="flex flex-wrap gap-1">
        {g.expiredCount > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {g.expiredCount} expired
          </Badge>
        )}
        {g.expiringCount > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {g.expiringCount} expiring
          </Badge>
        )}
        {g.missingCount > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {g.missingCount} missing
          </Badge>
        )}
      </div>
    ),
  },
  {
    key: "severity",
    header: "Sev",
    className: "w-[64px] text-right",
    render: (g) => (
      <Badge
        variant={
          g.highestSeverity === "high" || g.highestSeverity === "critical"
            ? "destructive"
            : "secondary"
        }
        className="text-[10px] uppercase"
      >
        {g.highestSeverity}
      </Badge>
    ),
  },
];

export function ComplianceDigest({ exceptions, loading }: ComplianceDigestProps) {
  const navigate = useNavigate();
  const groups = groupComplianceDigest(exceptions);

  return (
    <ControlSection
      title="Compliance Digest"
      description={
        groups.length > 0
          ? `${groups.length} ${groups.length === 1 ? "entity" : "entities"} need attention — tap to open profile`
          : "Per-entity rollup of expiring documents and missing compliance data"
      }
      flush
    >
      <CompactTable
        columns={columns}
        data={groups}
        loading={loading}
        emptyMessage="All entities are compliant. No expiring documents or missing data."
        onRowClick={(g) => g.route && navigate(g.route)}
      />
    </ControlSection>
  );
}
