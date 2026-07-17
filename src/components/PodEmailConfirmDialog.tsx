/**
 * PodEmailConfirmDialog — last-chance confirmation before a POD email
 * actually sends.
 *
 * emailPodPdf() silently sends via Resend to whatever address is stored on
 * the job (delivery_contact_email, falling back to pickup_contact_email)
 * with no opportunity to catch a typo'd or stale contact email before the
 * customer's Proof of Delivery — which can include damage photos and
 * pricing — goes to the wrong inbox. This dialog surfaces that address,
 * editable, and requires a plausible email before Send is enabled.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PodEmailConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail: string;
  jobRef: string;
  sending: boolean;
  onConfirm: (email: string) => void | Promise<void>;
}

export function PodEmailConfirmDialog({
  open,
  onOpenChange,
  defaultEmail,
  jobRef,
  sending,
  onConfirm,
}: PodEmailConfirmDialogProps) {
  const [email, setEmail] = useState(defaultEmail);

  // Re-seed from the job's contact email every time the dialog is (re)opened
  // — otherwise a previous job's edited address would leak into the next.
  useEffect(() => {
    if (open) setEmail(defaultEmail);
  }, [open, defaultEmail]);

  const trimmed = email.trim();
  const isValid = EMAIL_PATTERN.test(trimmed);

  const handleSend = () => {
    if (!isValid || sending) return;
    void onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Confirm recipient
          </DialogTitle>
          <DialogDescription>
            Double-check the email address for Job {jobRef}'s POD before sending. This is
            your last chance to correct it — the customer's Proof of Delivery cannot be
            un-sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="pod-email-recipient">Recipient email</Label>
          <Input
            id="pod-email-recipient"
            type="email"
            inputMode="email"
            autoFocus
            placeholder="customer@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            disabled={sending}
            className="min-h-[44px]"
            aria-invalid={trimmed.length > 0 && !isValid}
          />
          {trimmed.length > 0 && !isValid && (
            <p className="text-xs text-destructive">Enter a valid email address.</p>
          )}
          {!defaultEmail && (
            <p className="text-xs text-muted-foreground">
              No contact email is on file for this job — enter one to send.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!isValid || sending} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send POD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
