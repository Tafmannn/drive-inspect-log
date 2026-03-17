/**
 * Phase 5 — Driver Onboarding admin page.
 * List + detail view with document handling and approval.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listOnboarding, getOnboarding, createOnboarding, updateOnboarding,
  reviewOnboarding, uploadOnboardingDoc,
  type OnboardingRecord, type OnboardingStatus,
} from "@/lib/onboardingApi";
import {
  Plus, ArrowLeft, Upload, CheckCircle, XCircle, Clock,
  FileText, User, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<OnboardingStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_review: { label: "Pending Review", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
};

function StatusBadge({ status }: { status: OnboardingStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <Badge variant={cfg.variant} className="text-[11px]">{cfg.label}</Badge>;
}

// ── List View ────────────────────────────────────────────────────────

function OnboardingList({
  onSelect, onCreate,
}: {
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | "all">("all");
  const { data: records, isLoading } = useQuery({
    queryKey: ["admin-onboarding", statusFilter],
    queryFn: () => listOnboarding(statusFilter === "all" ? undefined : statusFilter),
  });

  return (
    <div className="space-y-4">
      {/* Filter + Create */}
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="ml-auto h-9 text-xs" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New
        </Button>
      </div>

      {isLoading && <DashboardSkeleton />}

      {!isLoading && (!records || records.length === 0) && (
        <div className="text-center py-12">
          <User className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No onboarding records found</p>
        </div>
      )}

      {records?.map(r => (
        <button
          key={r.id}
          className="w-full text-left p-4 rounded-xl border border-border bg-card space-y-2 active:bg-muted/50 transition-colors"
          onClick={() => onSelect(r.id)}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{r.full_name}</span>
            <StatusBadge status={r.status} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {r.phone && <span>{r.phone}</span>}
            {r.employment_type && <span className="capitalize">{r.employment_type}</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {r.headshot_url ? <CheckCircle className="h-3 w-3 text-success" /> : <XCircle className="h-3 w-3 text-destructive" />}
            <span>Headshot</span>
            {r.licence_front_url ? <CheckCircle className="h-3 w-3 text-success" /> : <XCircle className="h-3 w-3 text-destructive" />}
            <span>Licence</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Detail / Edit View ───────────────────────────────────────────────

function OnboardingDetail({
  recordId, onBack,
}: {
  recordId: string | null; // null = create mode
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docTarget, setDocTarget] = useState<"headshot" | "licence_front" | "licence_back" | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    display_name: "",
    phone: "",
    email: "",
    employment_type: "contractor",
    trade_plate_number: "",
    licence_expiry: "",
    notes: "",
  });

  const { data: record } = useQuery({
    queryKey: ["admin-onboarding-detail", recordId],
    queryFn: () => {
      if (!recordId) return null;
      return getOnboarding(recordId);
    },
    enabled: !!recordId,
  });

  useEffect(() => {
    if (record) {
      setForm({
        full_name: record.full_name,
        display_name: record.display_name ?? "",
        phone: record.phone ?? "",
        email: record.email ?? "",
        employment_type: record.employment_type ?? "contractor",
        trade_plate_number: record.trade_plate_number ?? "",
        licence_expiry: record.licence_expiry ?? "",
        notes: record.notes ?? "",
      });
    }
  }, [record]);

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast({ title: "Full name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (recordId && record) {
        await updateOnboarding(recordId, form as any);
        toast({ title: "Updated" });
      } else {
        await createOnboarding(form);
        toast({ title: "Created" });
      }
      qc.invalidateQueries({ queryKey: ["admin-onboarding"] });
      qc.invalidateQueries({ queryKey: ["admin-onboarding-detail"] });
      onBack();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!recordId) return;
    setSaving(true);
    try {
      await updateOnboarding(recordId, { status: "pending_review" } as any);
      qc.invalidateQueries({ queryKey: ["admin-onboarding"] });
      qc.invalidateQueries({ queryKey: ["admin-onboarding-detail"] });
      toast({ title: "Submitted for review" });
      onBack();
    } catch (err) {
      toast({ title: "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (decision: "approved" | "rejected") => {
    if (!recordId) return;
    setSaving(true);
    try {
      await reviewOnboarding(recordId, decision, reviewNotes);
      qc.invalidateQueries({ queryKey: ["admin-onboarding"] });
      qc.invalidateQueries({ queryKey: ["admin-onboarding-detail"] });
      toast({ title: decision === "approved" ? "Approved" : "Rejected" });
      onBack();
    } catch (err) {
      toast({ title: "Review failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDocUpload = async (file: File) => {
    if (!recordId || !docTarget) return;
    setSaving(true);
    try {
      await uploadOnboardingDoc(recordId, docTarget, file);
      qc.invalidateQueries({ queryKey: ["admin-onboarding"] });
      qc.invalidateQueries({ queryKey: ["admin-onboarding-detail", recordId] });
      toast({ title: "Document uploaded" });
    } catch (err) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setSaving(false);
      setDocTarget(null);
    }
  };

  const isCreate = !recordId;
  const canEdit = isCreate || (record && ["draft", "pending_review"].includes(record.status));
  const canReview = record && record.status === "pending_review";

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to list
      </Button>

      {record && (
        <div className="flex items-center gap-2">
          <StatusBadge status={record.status} />
          {record.reviewed_at && (
            <span className="text-[10px] text-muted-foreground">
              Reviewed {new Date(record.reviewed_at).toLocaleDateString("en-GB")}
            </span>
          )}
        </div>
      )}

      {/* Form fields */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Full Name *</Label>
            <Input className="h-9 text-xs" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Display Name</Label>
            <Input className="h-9 text-xs" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} disabled={!canEdit} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input className="h-9 text-xs" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input className="h-9 text-xs" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} disabled={!canEdit} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Employment Type</Label>
            <Select value={form.employment_type} onValueChange={v => setForm(f => ({ ...f, employment_type: v }))} disabled={!canEdit}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="agency">Agency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Trade Plate</Label>
            <Input className="h-9 text-xs" value={form.trade_plate_number} onChange={e => setForm(f => ({ ...f, trade_plate_number: e.target.value }))} disabled={!canEdit} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Licence Expiry</Label>
          <Input className="h-9 text-xs" type="date" value={form.licence_expiry} onChange={e => setForm(f => ({ ...f, licence_expiry: e.target.value }))} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea className="text-xs" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} disabled={!canEdit} />
        </div>
      </div>

      {/* Documents */}
      {recordId && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documents</h3>
          <div className="grid grid-cols-3 gap-2">
            {(["headshot", "licence_front", "licence_back"] as const).map(docType => {
              const url = record?.[`${docType}_url` as keyof OnboardingRecord] as string | null;
              const labels = { headshot: "Headshot / ID", licence_front: "Licence Front", licence_back: "Licence Back" };
              return (
                <div key={docType} className="rounded-lg border border-border p-2 text-center space-y-1">
                  {url ? (
                    <img src={url} alt={labels[docType]} className="w-full aspect-square object-cover rounded" />
                  ) : (
                    <div className="w-full aspect-square bg-muted rounded flex items-center justify-center">
                      <Camera className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">{labels[docType]}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] w-full"
                    onClick={() => { setDocTarget(docType); fileRef.current?.click(); }}
                    disabled={saving}
                  >
                    <Upload className="h-2.5 w-2.5 mr-0.5" /> {url ? "Replace" : "Upload"}
                  </Button>
                </div>
              );
            })}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              if (e.target.files?.[0]) handleDocUpload(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-2">
        {canEdit && (
          <Button className="w-full min-h-[44px]" onClick={handleSave} disabled={saving}>
            {isCreate ? "Create" : "Save Changes"}
          </Button>
        )}
        {record && record.status === "draft" && (
          <Button variant="outline" className="w-full min-h-[44px]" onClick={handleSubmitForReview} disabled={saving}>
            <FileText className="h-4 w-4 mr-1" /> Submit for Review
          </Button>
        )}
        {canReview && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Review Notes</Label>
              <Textarea className="text-xs" rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Optional review notes…" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 min-h-[44px] bg-success hover:bg-success/90" onClick={() => handleReview("approved")} disabled={saving}>
                <CheckCircle className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button variant="destructive" className="flex-1 min-h-[44px]" onClick={() => handleReview("rejected")} disabled={saving}>
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          </>
        )}
      </div>

      {record?.review_notes && (
        <div className="p-3 rounded-lg border border-border bg-muted/50">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Review Notes</p>
          <p className="text-xs text-foreground">{record.review_notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function AdminOnboarding() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <AppHeader title="Access Denied" showBack onBack={() => navigate("/admin")} />
        <p className="text-center py-12 text-sm text-muted-foreground">You do not have permission.</p>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Driver Onboarding" showBack onBack={() => navigate("/admin")} />
      <div className="p-4 max-w-lg mx-auto">
        {view === "list" ? (
          <OnboardingList
            onSelect={(id) => { setSelectedId(id); setView("detail"); }}
            onCreate={() => { setSelectedId(null); setView("detail"); }}
          />
        ) : (
          <OnboardingDetail
            recordId={selectedId}
            onBack={() => setView("list")}
          />
        )}
      </div>
      <BottomNav />
    </div>
  );
}
