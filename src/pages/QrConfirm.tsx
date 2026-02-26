import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

type Status = "loading" | "ready" | "confirming" | "done" | "expired" | "error";

export const QrConfirm = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [jobRef, setJobRef] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [eventType, setEventType] = useState("");
  const [confirmationId, setConfirmationId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    const load = async () => {
      const { data, error } = await supabase
        .from("qr_confirmations")
        .select("id, event_type, confirmed_at, expires_at, job_id")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) { setStatus("error"); return; }
      if (data.confirmed_at) { setStatus("done"); return; }
      if (new Date(data.expires_at) < new Date()) { setStatus("expired"); return; }

      setConfirmationId(data.id);
      setEventType(data.event_type);

      // Get job info
      const { data: job } = await supabase
        .from("jobs")
        .select("external_job_number, vehicle_reg")
        .eq("id", data.job_id)
        .single();

      if (job) {
        setJobRef(job.external_job_number || data.job_id.slice(0, 8));
        setVehicleReg(job.vehicle_reg);
      }
      setStatus("ready");
    };
    load();
  }, [token]);

  const handleConfirm = async () => {
    if (!customerName.trim()) return;
    setStatus("confirming");
    const { error } = await supabase
      .from("qr_confirmations")
      .update({
        confirmed_at: new Date().toISOString(),
        customer_name: customerName.trim(),
        notes: notes.trim() || null,
      })
      .eq("id", confirmationId);

    setStatus(error ? "error" : "done");
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <img src="/axentra-logo.png" alt="Axentra" className="h-12 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-foreground">Axentra Vehicle Logistics</h1>
          <p className="text-sm text-muted-foreground">Handover Confirmation</p>
        </div>

        {status === "loading" && (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        )}

        {status === "error" && (
          <div className="text-center py-6 space-y-2">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="font-semibold text-foreground">Invalid or expired link</p>
            <p className="text-sm text-muted-foreground">This QR code is not valid. Please contact the driver.</p>
          </div>
        )}

        {status === "expired" && (
          <div className="text-center py-6 space-y-2">
            <XCircle className="h-12 w-12 text-warning mx-auto" />
            <p className="font-semibold text-foreground">Link Expired</p>
            <p className="text-sm text-muted-foreground">This confirmation link has expired.</p>
          </div>
        )}

        {status === "ready" && (
          <>
            <Card className="p-3 bg-muted/50 space-y-1">
              <p className="text-xs text-muted-foreground">Job Reference</p>
              <p className="text-sm font-semibold text-foreground">{jobRef} – {vehicleReg}</p>
              <p className="text-xs text-muted-foreground capitalize">{eventType} Handover</p>
            </Card>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Your Name *</Label>
                <Input placeholder="Full name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Textarea placeholder="Any comments…" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
              <Button className="w-full" onClick={handleConfirm} disabled={!customerName.trim()}>
                Confirm Handover
              </Button>
            </div>
          </>
        )}

        {status === "confirming" && (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        )}

        {status === "done" && (
          <div className="text-center py-6 space-y-2">
            <CheckCircle className="h-12 w-12 text-success mx-auto" />
            <p className="font-semibold text-foreground">Handover Confirmed</p>
            <p className="text-sm text-muted-foreground">Thank you. The driver has been notified.</p>
          </div>
        )}
      </Card>
    </div>
  );
};
