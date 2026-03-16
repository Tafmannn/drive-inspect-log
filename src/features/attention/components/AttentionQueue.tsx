import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AttentionException } from "../types/exceptionTypes";

const sevVariant: Record<string, "destructive" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const catEmoji: Record<string, string> = {
  timing: "⏱",
  evidence: "📎",
  sync: "🔄",
  state: "🔒",
};

interface Props {
  exceptions: AttentionException[];
  showOrg: boolean;
  loading: boolean;
}

export function AttentionQueue({ exceptions, showOrg, loading }: Props) {
  const navigate = useNavigate();

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-10">Loading exceptions…</p>;
  }

  if (!exceptions.length) {
    return (
      <div className="text-center py-10">
        <p className="text-lg font-semibold text-foreground">✅ All clear</p>
        <p className="text-sm text-muted-foreground mt-1">No operational exceptions require attention.</p>
      </div>
    );
  }

  /* ── Mobile card view ─────────────────────────────────── */
  const mobileView = (
    <div className="space-y-3 lg:hidden">
      {exceptions.map(e => (
        <div key={e.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={sevVariant[e.severity] ?? "secondary"} className="text-xs uppercase">
                {e.severity}
              </Badge>
              <span className="text-xs text-muted-foreground">{catEmoji[e.category]} {e.category}</span>
            </div>
            {e.jobNumber && <span className="text-xs font-mono text-muted-foreground">{e.jobNumber}</span>}
          </div>
          <p className="text-sm font-medium text-foreground">{e.title}</p>
          <p className="text-xs text-muted-foreground">{e.detail}</p>
          {showOrg && e.orgName && <p className="text-xs text-muted-foreground">Org: {e.orgName}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
            <Button size="sm" variant="outline" className="min-h-[36px] text-xs" onClick={() => navigate(e.actionRoute)}>
              {e.actionLabel}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  /* ── Desktop table view ───────────────────────────────── */
  const desktopView = (
    <div className="hidden lg:block rounded-xl border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs w-[90px]">Severity</TableHead>
            <TableHead className="text-xs w-[90px]">Category</TableHead>
            <TableHead className="text-xs w-[100px]">Job #</TableHead>
            {showOrg && <TableHead className="text-xs w-[140px]">Organisation</TableHead>}
            <TableHead className="text-xs">Title</TableHead>
            <TableHead className="text-xs">Detail</TableHead>
            <TableHead className="text-xs w-[150px]">Time</TableHead>
            <TableHead className="text-xs w-[110px] text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {exceptions.map(e => (
            <TableRow key={e.id}>
              <TableCell>
                <Badge variant={sevVariant[e.severity] ?? "secondary"} className="text-xs uppercase">{e.severity}</Badge>
              </TableCell>
              <TableCell className="text-xs">{catEmoji[e.category]} {e.category}</TableCell>
              <TableCell className="text-xs font-mono">{e.jobNumber ?? "—"}</TableCell>
              {showOrg && <TableCell className="text-xs text-muted-foreground">{e.orgName ?? "—"}</TableCell>}
              <TableCell className="text-sm font-medium">{e.title}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{e.detail}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" className="min-h-[36px] text-xs" onClick={() => navigate(e.actionRoute)}>
                  {e.actionLabel}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      {mobileView}
      {desktopView}
    </>
  );
}
