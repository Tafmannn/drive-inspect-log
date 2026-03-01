import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useCreateExpense, useUpdateExpense, useUploadReceipt } from "@/hooks/useExpenses";
import { EXPENSE_CATEGORIES, getExpensesForJob } from "@/lib/expenseApi";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Camera, ImagePlus, X, ScanLine } from "lucide-react";
import type { Job } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { saveDraft, loadDraft, clearDraft, draftKey } from "@/lib/autosave";
import { ocrReceipt } from "@/lib/visionApi";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const ExpenseForm = () => {
  const navigate = useNavigate();
  const { canUseGallery } = useAuth();
  const { expenseId } = useParams<{ expenseId: string }>();
  const [searchParams] = useSearchParams();
  const preselectedJobId = searchParams.get("jobId") || "";
  const isEdit = !!expenseId;
  const DRAFT_KEY = draftKey("expense", expenseId || "new");

  const [jobs, setJobs] = useState<Pick<Job, "id" | "vehicle_reg" | "external_job_number">[]>([]);
  const [jobId, setJobId] = useState(preselectedJobId);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<{ file: File; preview: string }[]>([]);
  const [existingReceipts, setExistingReceipts] = useState<{ id: string; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingExpense, setLoadingExpense] = useState(isEdit);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const uploadReceipt = useUploadReceipt();

  // ─── Autosave ──────────────────────────────────────────────
  interface DraftData { jobId: string; category: string; amount: string; date: string; time: string; label: string; notes: string }

  const saveDraftNow = useCallback(() => {
    if (isEdit) return; // don't autosave edits
    const draft: DraftData = { jobId, category, amount, date, time, label, notes };
    saveDraft(DRAFT_KEY, draft);
  }, [jobId, category, amount, date, time, label, notes, isEdit, DRAFT_KEY]);

  // Autosave on field changes (debounced)
  useEffect(() => {
    if (isEdit) return;
    const t = setTimeout(saveDraftNow, 1500);
    return () => clearTimeout(t);
  }, [saveDraftNow, isEdit]);

  // Check for existing draft on mount
  useEffect(() => {
    if (isEdit) return;
    const draft = loadDraft<DraftData>(DRAFT_KEY);
    if (draft) setShowDraftDialog(true);
  }, []);

  const restoreDraft = () => {
    const draft = loadDraft<DraftData>(DRAFT_KEY);
    if (draft) {
      setJobId(draft.data.jobId || preselectedJobId);
      setCategory(draft.data.category);
      setAmount(draft.data.amount);
      setDate(draft.data.date);
      setTime(draft.data.time);
      setLabel(draft.data.label);
      setNotes(draft.data.notes);
    }
    setShowDraftDialog(false);
  };

  const discardDraft = () => {
    clearDraft(DRAFT_KEY);
    setShowDraftDialog(false);
  };

  useEffect(() => {
    // Load jobs for dropdown (active + completed in last 14 days)
    const load = async () => {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const { data } = await supabase
        .from("jobs")
        .select("id, vehicle_reg, external_job_number")
        .or(`completed_at.is.null,completed_at.gte.${fourteenDaysAgo.toISOString()}`)
        .order("created_at", { ascending: false });
      setJobs((data ?? []) as Pick<Job, "id" | "vehicle_reg" | "external_job_number">[]);
    };
    load();
  }, []);

  // Load existing expense for editing
  useEffect(() => {
    if (!expenseId) return;
    const loadExpense = async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", expenseId)
        .single();
      if (error || !data) {
        toast({ title: "Expense not found.", variant: "destructive" });
        navigate(-1);
        return;
      }
      setJobId(data.job_id);
      setCategory(data.category);
      setAmount(String(data.amount));
      setDate(data.date);
      setTime(data.time || "");
      setLabel(data.label || "");
      setNotes(data.notes || "");

      // Load receipts
      const { data: receipts } = await supabase
        .from("expense_receipts")
        .select("id, url")
        .eq("expense_id", expenseId);
      setExistingReceipts((receipts ?? []) as { id: string; url: string }[]);
      setLoadingExpense(false);
    };
    loadExpense();
  }, [expenseId]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
    }));
    setReceiptFiles(prev => [...prev, ...newFiles]);

    // Auto-scan first receipt for OCR if Vision AI is enabled
    if (newFiles.length > 0 && !amount) {
      handleOcrScan(newFiles[0].file);
    }
  };

  const handleOcrScan = async (file: File) => {
    setScanning(true);
    try {
      const result = await ocrReceipt(file);
      if (result) {
        if (result.amount && !amount) setAmount(String(result.amount));
        if (result.date && date === new Date().toISOString().slice(0, 10)) setDate(result.date);
        if (result.vendor && !label) setLabel(result.vendor);
        toast({ title: "Receipt scanned. Please verify fields." });
      }
    } catch {
      // OCR failed silently — user can fill manually
    } finally {
      setScanning(false);
    }
  };

  const removeReceipt = (idx: number) => {
    setReceiptFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async () => {
    if (!jobId) { toast({ title: "Please select a job.", variant: "destructive" }); return; }
    if (!category) { toast({ title: "Please select a category.", variant: "destructive" }); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast({ title: "Please enter a valid amount.", variant: "destructive" }); return;
    }
    if (category === "Misc / Other" && !label.trim()) {
      toast({ title: "Label required for Misc / Other.", variant: "destructive" }); return;
    }

    setSaving(true);
    try {
      let targetId = expenseId;

      if (isEdit && expenseId) {
        await updateExpense.mutateAsync({
          id: expenseId,
          input: {
            job_id: jobId,
            date,
            time: time || null,
            amount: Number(amount),
            category,
            label: label || null,
            notes: notes || null,
          },
        });
      } else {
        const expense = await createExpense.mutateAsync({
          job_id: jobId,
          date,
          time: time || null,
          amount: Number(amount),
          category,
          label: label || null,
          notes: notes || null,
        });
        targetId = expense.id;
      }

      // Upload new receipts
      for (const r of receiptFiles) {
        await uploadReceipt.mutateAsync({ expenseId: targetId!, file: r.file });
      }

      toast({ title: isEdit ? "Expense updated." : "Expense saved." });
      clearDraft(DRAFT_KEY);
      navigate(-1);
    } catch {
      toast({ title: "Save failed. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Draft restore dialog */}
      <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume saved progress?</DialogTitle>
            <DialogDescription>You have an unsaved expense draft. Would you like to restore it?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={discardDraft}>Discard</Button>
            <Button onClick={restoreDraft}>Restore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AppHeader title={isEdit ? "Edit Expense" : "Add Expense"} showBack onBack={() => navigate(-1)} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {loadingExpense ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
        <>
        {/* Job */}
        <div className="space-y-1.5">
          <Label>Job *</Label>
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger><SelectValue placeholder="Select job" /></SelectTrigger>
            <SelectContent>
              {jobs.map(j => (
                <SelectItem key={j.id} value={j.id}>
                  {j.external_job_number || j.id.slice(0, 8)} – {j.vehicle_reg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label>Category *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <Label>Amount (£) *</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Time</Label>
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        {/* Label */}
        <div className="space-y-1.5">
          <Label>Label {category === "Misc / Other" ? "*" : ""}</Label>
          <Input placeholder="e.g. M1 toll – Leeds to Liverpool" value={label} onChange={e => setLabel(e.target.value)} />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea placeholder="Additional details..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>

        {/* Receipts */}
        <Card className="p-4 space-y-3">
          <Label>Receipt Photos</Label>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
              <Camera className="h-4 w-4 mr-1" /> Camera
            </Button>
            {canUseGallery && (
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="h-4 w-4 mr-1" /> Gallery
              </Button>
            )}
            {receiptFiles.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => handleOcrScan(receiptFiles[0].file)} disabled={scanning}>
                {scanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanLine className="h-4 w-4 mr-1" />} Scan Receipt
              </Button>
            )}
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileSelect(e.target.files)} />
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFileSelect(e.target.files)} />

          {/* Existing receipts (edit mode) */}
          {existingReceipts.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {existingReceipts.map((r) => (
                <div key={r.id} className="relative">
                  <img src={r.url} alt="Receipt" className="w-full h-20 object-cover rounded border" />
                </div>
              ))}
            </div>
          )}

          {receiptFiles.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {receiptFiles.map((r, i) => (
                <div key={i} className="relative">
                  <img src={r.preview} alt="Receipt" className="w-full h-20 object-cover rounded border" />
                  <button
                    type="button"
                    onClick={() => removeReceipt(i)}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Submit */}
        <Button className="w-full" onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Update Expense" : "Save Expense"}
        </Button>
        </>
        )}
      </div>
      <BottomNav />
    </div>
  );
};
