import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { resolveBackTarget } from "@/lib/navigationUtils";
import { useAuth } from "@/context/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { downloadInvoicePdf, type InvoiceLineItem, type InvoiceData } from "@/lib/invoicePdf";
import {
  Loader2, Plus, Trash2, FileDown, Receipt,
  Building2, User, Calendar, CreditCard
} from "lucide-react";
import type { Job } from "@/lib/types";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function getNextInvoiceNumber(orgId: string): Promise<string> {
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1);
  const last = data?.[0]?.invoice_number;
  let next = 1001;
  if (last) {
    const match = last.match(/(\d+)$/);
    if (match) next = parseInt(match[1]) + 1;
  }
  const year = new Date().getFullYear().toString().slice(-2);
  return `AX${year}-${String(next).padStart(4, "0")}`;
}

interface LineItemRowProps {
  item: InvoiceLineItem & { id: string };
  onChange: (id: string, field: keyof InvoiceLineItem, value: string | number) => void;
  onRemove: (id: string) => void;
  isOnly: boolean;
}

function LineItemRow({ item, onChange, onRemove, isOnly }: LineItemRowProps) {
  const lineTotal = item.quantity * item.unitPrice;
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <div className="col-span-5">
        <Input
          placeholder="Description"
          value={item.description}
          onChange={e => onChange(item.id, "description", e.target.value)}
          className="min-h-[40px] text-sm"
        />
      </div>
      <div className="col-span-2">
        <Input
          type="number" min={1} placeholder="Qty"
          value={item.quantity}
          onChange={e => onChange(item.id, "quantity", parseFloat(e.target.value) || 1)}
          className="min-h-[40px] text-sm text-center"
        />
      </div>
      <div className="col-span-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">£</span>
          <Input
            type="number" min={0} step={0.01} placeholder="0.00"
            value={item.unitPrice}
            onChange={e => onChange(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
            className="min-h-[40px] text-sm pl-6"
          />
        </div>
      </div>
      <div className="col-span-2 text-sm font-semibold text-right pr-1">
        £{lineTotal.toFixed(2)}
      </div>
      <div className="col-span-1 flex justify-end">
        <Button
          size="icon" variant="ghost"
          className="h-9 w-9 text-destructive hover:text-destructive"
          onClick={() => onRemove(item.id)}
          disabled={isOnly}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function InvoiceSummary({ items, vatRate }: { items: InvoiceLineItem[]; vatRate: number }) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>Subtotal</span><span>£{subtotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>VAT ({vatRate}%)</span><span>£{vatAmount.toFixed(2)}</span>
      </div>
      <Separator />
      <div className="flex justify-between font-bold text-base">
        <span>Total Due</span><span>£{total.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function InvoiceGenerator() {
  const navigate = useNavigate();
  const { jobId: routeJobId } = useParams<{ jobId?: string }>();
  const [searchParams] = useSearchParams();
  const jobId = routeJobId || searchParams.get("jobId") || undefined;
  const backTarget = resolveBackTarget(searchParams, jobId ? `/jobs/${jobId}` : "/admin");
  const { isAdmin, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState<Job | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(formatDate(new Date()));
  const [dueDate, setDueDate] = useState(formatDate(addDays(new Date(), 30)));
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [vatRate, setVatRate] = useState(20);
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<(InvoiceLineItem & { id: string })[]>([
    { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 },
  ]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const orgId = session?.user?.user_metadata?.org_id ?? "a0000000-0000-0000-0000-000000000001";
        const num = await getNextInvoiceNumber(orgId);
        setInvoiceNumber(num);

        if (jobId) {
          const { data: jobData } = await supabase.from("jobs").select("*").eq("id", jobId).single();
          if (jobData) {
            const j = jobData as Job;
            setJob(j);
            setClientName(j.delivery_contact_name || j.client_name || "");
            setClientCompany(j.delivery_company || j.client_company || "");
            setClientEmail(j.client_email || "");
            setClientAddress(`${j.delivery_address_line1}, ${j.delivery_city} ${j.delivery_postcode}`);
            const desc = `Vehicle transportation – ${j.vehicle_reg} (${j.vehicle_make} ${j.vehicle_model}) – ${j.pickup_city || "—"} → ${j.delivery_city || "—"}`;
            const price = j.admin_rate || j.total_price || 0;
            setLineItems([{ id: crypto.randomUUID(), description: desc, quantity: 1, unitPrice: Number(price) }]);

            const { data: expenses } = await supabase
              .from("expenses")
              .select("*")
              .eq("job_id", jobId)
              .eq("is_hidden", false)
              .eq("billable_on_pod", true);

            if (expenses?.length) {
              const expItems = expenses.map(e => ({
                id: crypto.randomUUID(),
                description: `${e.category}${e.label ? ` – ${e.label}` : ""}`,
                quantity: 1,
                unitPrice: Number(e.amount),
              }));
              setLineItems(prev => [...prev, ...expItems]);
            }
          }
        }
      } catch (e) {
        toast({ title: "Failed to load", description: String(e), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  const handleLineItemChange = (id: string, field: keyof InvoiceLineItem, value: string | number) => {
    setLineItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const addLineItem = () => {
    setLineItems(prev => [...prev, { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(prev => prev.filter(item => item.id !== id));
  };

  const buildInvoiceData = (): InvoiceData => ({
    invoiceNumber, issueDate,
    dueDate: dueDate || undefined,
    paymentTerms, vatRate, clientName,
    clientCompany: clientCompany || undefined,
    clientEmail: clientEmail || undefined,
    clientAddress: clientAddress || undefined,
    lineItems: lineItems.map(({ id: _id, ...rest }) => rest),
    notes: notes || undefined,
    jobRef: job?.external_job_number || undefined,
    vehicleReg: job?.vehicle_reg || undefined,
    route: job ? `${job.pickup_city || "—"} → ${job.delivery_city || "—"}` : undefined,
  });

  const handleGeneratePdf = async () => {
    if (!clientName.trim()) {
      toast({ title: "Client name is required", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      await downloadInvoicePdf(buildInvoiceData());
      toast({ title: "Invoice downloaded ✓" });
    } catch (e) {
      toast({ title: "Failed to generate PDF", description: String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!clientName.trim()) {
      toast({ title: "Client name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const orgId = session?.user?.user_metadata?.org_id ?? "a0000000-0000-0000-0000-000000000001";
      const inv = buildInvoiceData();
      const subtotal = inv.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const vat = subtotal * (vatRate / 100);
      const total = subtotal + vat;

      const { error } = await supabase.from("invoices").insert({
        org_id: orgId,
        job_id: jobId || null,
        invoice_number: inv.invoiceNumber,
        client_name: inv.clientName,
        client_email: inv.clientEmail || null,
        client_company: inv.clientCompany || null,
        client_address: inv.clientAddress || null,
        issue_date: inv.issueDate,
        due_date: inv.dueDate || null,
        payment_terms: inv.paymentTerms || "Net 30",
        line_items: inv.lineItems as any,
        subtotal, vat_rate: vatRate, vat_amount: vat, total,
        notes: inv.notes || null,
        status: "draft",
      } as any);

      if (error) throw error;
      toast({ title: "Invoice saved ✓", description: `${inv.invoiceNumber} saved as draft` });
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <AppHeader title="Invoice Generator" showBack onBack={() => navigate(-1)} />
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted pb-24">
      <AppHeader title="Invoice Generator" showBack onBack={() => navigate(-1)}>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || generating}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Draft"}
          </Button>
          <Button size="sm" onClick={handleGeneratePdf} disabled={generating || saving}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileDown className="w-4 h-4 mr-1" />PDF</>}
          </Button>
        </div>
      </AppHeader>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {job && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3 flex items-center gap-2 text-sm">
                <Receipt className="w-4 h-4 text-primary shrink-0" />
                <span className="text-muted-foreground">Generating invoice for job</span>
                <Badge variant="secondary">{job.external_job_number || job.id.slice(0, 8)}</Badge>
                <span className="font-medium">{job.vehicle_reg}</span>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />Invoice Details
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Invoice Number</Label>
                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="mt-1 min-h-[40px] font-mono text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">VAT Rate</Label>
                <Select value={String(vatRate)} onValueChange={v => setVatRate(Number(v))}>
                  <SelectTrigger className="mt-1 min-h-[40px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (Zero-rated)</SelectItem>
                    <SelectItem value="5">5% (Reduced)</SelectItem>
                    <SelectItem value="20">20% (Standard)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Issue Date</Label>
                <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="mt-1 min-h-[40px]" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="mt-1 min-h-[40px]" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Payment Terms</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger className="mt-1 min-h-[40px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                    <SelectItem value="Net 7">Net 7</SelectItem>
                    <SelectItem value="Net 14">Net 14</SelectItem>
                    <SelectItem value="Net 30">Net 30</SelectItem>
                    <SelectItem value="Net 60">Net 60</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />Bill To
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Client Name *</Label>
                  <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Full name" className="mt-1 min-h-[40px]" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Company</Label>
                  <Input value={clientCompany} onChange={e => setClientCompany(e.target.value)} placeholder="Company name" className="mt-1 min-h-[40px]" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@example.com" className="mt-1 min-h-[40px]" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Address</Label>
                <Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Street, City, Postcode" className="mt-1 min-h-[40px]" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />Line Items
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-0.5">
                <div className="col-span-5">Description</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-2">Unit Price</div>
                <div className="col-span-2 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              <Separator />
              {lineItems.map(item => (
                <LineItemRow
                  key={item.id} item={item}
                  onChange={handleLineItemChange}
                  onRemove={removeLineItem}
                  isOnly={lineItems.length === 1}
                />
              ))}
              <Button variant="outline" size="sm" className="w-full" onClick={addLineItem}>
                <Plus className="w-4 h-4 mr-1.5" />Add Line Item
              </Button>
              <Separator />
              <InvoiceSummary items={lineItems} vatRate={vatRate} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Notes / Terms</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Textarea
                placeholder="Additional notes, special terms, or messages to the client..."
                value={notes} onChange={e => setNotes(e.target.value)}
                rows={3} className="resize-none text-sm"
              />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 min-h-[48px]" onClick={handleSave} disabled={saving || generating}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Draft
            </Button>
            <Button className="flex-1 min-h-[48px]" onClick={handleGeneratePdf} disabled={generating || saving}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
              Download PDF
            </Button>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
