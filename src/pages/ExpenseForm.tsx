import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { PhotoViewer } from "@/components/PhotoViewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useCreateExpense, useUpdateExpense, useUploadReceipt } from "@/hooks/useExpenses";
import { EXPENSE_CATEGORIES } from "@/lib/expenseApi";
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

type ExistingReceipt = { id: string; url: string };

export const ExpenseForm = () => {
  const navigate = useNavigate();
  const { canUseGallery } = useAuth();
  const { expenseId } = useParams();
  const [searchParams] = useSearchParams();
  const initialJobId = searchParams.get("jobId") || "";
  const [jobId, setJobId] = useState(initialJobId);

  const isEdit = Boolean(expenseId);
  const DRAFT_KEY = draftKey("expense", jobId);

  const [job, setJob] = useState<Job | null>(null);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<{ file: File; preview: string }[]>([]);
  const [existingReceipts, setExistingReceipts] = useState<ExistingReceipt[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingExpense, setLoadingExpense] = useState(isEdit);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const uploadReceipt = useUploadReceipt();

  // ─── Autosave ─────────────────────────────────────────

  interface DraftData {
    jobId: string;
    category: string;
    amount: string;
    date: string;
    time: string;
    label: string;
    notes: string;
  }

  const saveDraftNow = useCallback(() => {
    if (isEdit) return;
    const draft: DraftData = { jobId, category, amount, date, time, label, notes };
    saveDraft(DRAFT_KEY, draft);
  }, [jobId, category, amount, date, time, label, notes, isEdit, DRAFT_KEY]);

  useEffect(() => {
    if (isEdit) return;
    const t = setTimeout(saveDraftNow, 1500);
    return () => clearTimeout(t);
  }, [saveDraftNow, isEdit]);

  // Load draft on mount for new expenses
  useEffect(() => {
    if (isEdit) return;
    const draft = loadDraft<DraftData>(DRAFT_KEY);
    if (draft?.data && draft.data.jobId === jobId) {
      setCategory(draft.data.category);
      setAmount(draft.data.amount);
      setDate(draft.data.date);
      setTime(draft.data.time);
      setLabel(draft.data.label);
      setNotes(draft.data.notes);
    }
  }, [DRAFT_KEY, jobId, isEdit]);

  const clearDraftAndNavigateBack = () => {
    if (!isEdit) clearDraft(DRAFT_KEY);
    navigate(jobId ? `/expenses?jobId=${jobId}` : "/expenses");
  };

  // ─── Load Job & Existing Expense ──────────────────────

  useEffect(() => {
    const loadJobAndExpense = async () => {
      if (jobId) {
        const { data } = await supabase
          .from("jobs")
          .select("*")
          .eq("id", jobId)
          .single();
        setJob(data as Job | null);
      }

      if (!expenseId) return;

      const { data: expense, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", expenseId)
        .single();

      if (error) {
        console.error("Failed to load expense", error);
        toast({
          title: "Error",
          description: "Unable to load this expense. Please try again.",
          variant: "destructive",
        });
        setLoadingExpense(false);
        return;
      }

      if (expense) {
        setCategory(expense.category);
        setAmount(String(expense.amount));
        setDate(expense.date);
        setTime(expense.time || "");
        setLabel(expense.label || "");
        setNotes(expense.notes || "");
      }

      // Load existing receipts for this expense
      const { data: receipts, error: rErr } = await supabase
        .from("expense_receipts")
        .select("id, url")
        .eq("expense_id", expenseId);

      if (rErr) {
        console.error("Failed to load receipts", rErr);
      }

      setExistingReceipts((receipts ?? []) as ExistingReceipt[]);
      setLoadingExpense(false);
    };

    loadJobAndExpense();
  }, [expenseId, jobId]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newFiles: { file: File; preview: string }[] = [];
    for (const file of Array.from(files)) {
      const preview = URL.createObjectURL(file);
      newFiles.push({ file, preview });
    }
    setReceiptFiles(prev => [...prev, ...newFiles]);

    if (newFiles.length > 0 && !amount) {
      void handleOcrScan(newFiles[0].file);
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
      }
    } catch (err) {
      console.error("OCR failed", err);
      toast({
        title: "Scan failed",
        description: "We couldn't read this receipt automatically. You can still enter details manually.",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const handleRemoveNewReceipt = (index: number) => {
    setReceiptFiles(prev => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return next;
    });
  };

  useEffect(() => {
    return () => {
      receiptFiles.forEach(r => URL.revokeObjectURL(r.preview));
    };
  }, [receiptFiles]);

  // ─── Submit ───────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId) {
      toast({ title: "Job is required", description: "You must select a job before saving an expense.", variant: "destructive" });
      return;
    }
    if (!category) {
      toast({ title: "Category required", description: "Please select an expense category.", variant: "destructive" });
      return;
    }
    const amt = Number(amount);
    if (!amt || isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid amount greater than zero.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (isEdit && expenseId) {
        await updateExpense.mutateAsync({
          id: expenseId,
          date,
          time: time || null,
          amount: amt,
          category,
          label: label || null,
          notes: notes || null,
        });
      } else {
        const created = await createExpense.mutateAsync({
          job_id: jobId,
          date,
          time: time || null,
          amount: amt,
          category,
          label: label || null,
          notes: notes || null,
        });

        clearDraft(DRAFT_KEY);

        for (const { file } of receiptFiles) {
          await uploadReceipt.mutateAsync({ expenseId: created.id, file });
        }
      }

      toast({ title: "Saved", description: "Expense has been saved successfully." });
      clearDraftAndNavigateBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to save expense", msg, err);
      toast({ title: "Save failed", description: msg || "We couldn't save this expense. Please try again.", variant: "destructive" });
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (!isEdit) {
      const hasDraftChanges = category || amount || notes || receiptFiles.length > 0 || label;
      if (hasDraftChanges) {
        setShowDraftDialog(true);
        return;
      }
    }
    clearDraftAndNavigateBack();
  };

  if (loadingExpense) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader title={isEdit ? "Edit Expense" : "New Expense"} onBack={handleBack} />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader title={isEdit ? "Edit Expense" : "New Expense"} onBack={handleBack} />
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-lg mx-auto p-4 space-y-4">
          {job && (
            <Card className="p-3 text-sm">
              <p className="font-medium">{job.vehicle_reg}</p>
              <p className="text-muted-foreground">
                {job.pickup_city} → {job.delivery_city}
              </p>
              {job.external_job_number && (
                <p className="text-xs text-muted-foreground mt-1">
                  Job ref: {job.external_job_number}
                </p>
              )}
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Card className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (£)</Label>
                  <Input id="amount" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="time">Time (optional)</Label>
                  <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label (optional)</Label>
                  <Input id="label" placeholder="e.g. Fuel in Leeds" value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea id="notes" rows={3} placeholder="Anything helpful for accounts…" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </Card>

            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-medium">Receipts</p>
                  <p className="text-xs text-muted-foreground">Add clear photos of your receipts for this expense.</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="icon" variant="outline" onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="w-4 h-4" />
                  </Button>
                  {canUseGallery && (
                    <Button type="button" size="icon" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <ImagePlus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileSelect(e.target.files)} />
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFileSelect(e.target.files)} />

              {existingReceipts.length > 0 && (
                <PhotoViewer
                  title="Existing receipts"
                  photos={existingReceipts.map((r) => ({ url: r.url, label: "Receipt" }))}
                />
              )}

              {receiptFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {receiptFiles.map((r, i) => (
                    <div key={i} className="relative">
                      <img src={r.preview} alt={`Receipt ${i + 1}`} className="rounded-lg w-full aspect-square object-cover border border-border" />
                      <button type="button" onClick={() => handleRemoveNewReceipt(i)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {scanning && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ScanLine className="w-4 h-4 animate-pulse" />
                  <span>Scanning receipt…</span>
                </div>
              )}
            </Card>

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 min-h-[44px]" onClick={handleBack}>Cancel</Button>
              <Button type="submit" className="flex-1 min-h-[44px]" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {isEdit ? "Update" : "Save"}
              </Button>
            </div>
          </form>
        </div>
      </main>
      <BottomNav />

      {/* Draft dialog */}
      <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>You have unsaved expense data. Would you like to keep it as a draft?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { clearDraft(DRAFT_KEY); clearDraftAndNavigateBack(); }}>Discard</Button>
            <Button onClick={() => { saveDraftNow(); clearDraftAndNavigateBack(); }}>Keep Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
