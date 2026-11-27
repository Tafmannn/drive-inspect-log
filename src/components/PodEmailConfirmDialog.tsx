/**
 * PodEmailConfirmDialog — last-chance recipient confirmation before a
 * customer-facing email (POD, invoice) actually sends.
 *
 * The send paths otherwise use whatever address is stored on the record
 * (job contact emails, client email) with no opportunity to catch a
 * typo'd or stale address before a document that can include damage
 * photos and pricing goes to the wrong inbox. This dialog surfaces that
 * address, editable, and requires a plausible email before Send is
 * enabled. `documentLabel` names what's being sent.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Most copy addresses accepted per field (matches send-invoice-email). */
export const MAX_COPY_RECIPIENTS = 10;

export interface EmailCopies {
  cc: string[];
  bcc: string[];
}

/**
 * Parse a comma / semicolon / space separated address list. Returns the unique addresses
 * (case-insensitive) and any entries that are not valid emails.
 */
export function parseAddressList(raw: string): { addresses: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const addresses: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const a = part.trim();
    if (!a) continue;
    if (!EMAIL_PATTERN.test(a)) { invalid.push(a); continue; }
    const key = a.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(a);
  }
  return { addresses, invalid };
}

interface PodEmailConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail: string;
  /** What is being sent, e.g. "Job AX0063's POD" or "Invoice AX-INV-0042". */
  documentLabel: string;
  sending: boolean;
  /** Offer CC / BCC fields (invoices). Copies are passed as the second argument. */
  allowCopies?: boolean;
  onConfirm: (email: string, copies?: EmailCopies) => void | Promise<void>;
}

export function PodEmailConfirmDialog({
  open,
  onOpenChange,
  defaultEmail,
  documentLabel,
  sending,
  allowCopies = false,
  onConfirm,
}: PodEmailConfirmDialogProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [showCopies, setShowCopies] = useState(false);
  const [ccRaw, setCcRaw] = useState("");
  const [bccRaw, setBccRaw] = useState("");

  // Re-seed from the job's contact email every time the dialog is (re)opened
  // — otherwise a previous job's edited address would leak into the next.
  useEffect(() => {
    if (open) {
      setEmail(defaultEmail);
      setShowCopies(false);
      setCcRaw("");
      setBccRaw("");
    }
  }, [open, defaultEmail]);

  const trimmed = email.trim();
  const isValid = EMAIL_PATTERN.test(trimmed);

  // Copies: the main recipient is never repeated, and an address in CC is not also BCC'd.
  const toKey = trimmed.toLowerCase();
  const cc = parseAddressList(ccRaw);
  const bcc = parseAddressList(bccRaw);
  const ccList = cc.addresses.filter((a) => a.toLowerCase() !== toKey);
  const ccKeys = new Set(ccList.map((a) => a.toLowerCase()));
  const bccList = bcc.addresses.filter((a) => a.toLowerCase() !== toKey && !ccKeys.has(a.toLowerCase()));
  const ccError = cc.invalid.length
    ? `Not a valid email: ${cc.invalid.join(", ")}`
    : ccList.length > MAX_COPY_RECIPIENTS ? `At most ${MAX_COPY_RECIPIENTS} CC addresses.` : null;
  const bccError = bcc.invalid.length
    ? `Not a valid email: ${bcc.invalid.join(", ")}`
    : bccList.length > MAX_COPY_RECIPIENTS ? `At most ${MAX_COPY_RECIPIENTS} BCC addresses.` : null;
  const copiesValid = !allowCopies || (!ccError && !bccError);
  const canSend = isValid && copiesValid && !sending;

  const handleSend = () => {
    if (!canSend) return;
    if (allowCopies) void onConfirm(trimmed, { cc: ccList, bcc: bccList });
    else void onConfirm(trimmed);
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
            Double-check the email address for {documentLabel} before sending. This is
            your last chance to correct it — the email cannot be un-sent.
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

        {allowCopies && !showCopies && (
          <Button
            type="button"
            variant="link"
            className="h-auto self-start p-0 text-sm"
            onClick={() => setShowCopies(true)}
            disabled={sending}
          >
            Add CC / BCC
          </Button>
        )}
        {allowCopies && showCopies && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email-cc">CC</Label>
              <Input
                id="email-cc"
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="name@example.com, other@example.com"
                value={ccRaw}
                onChange={(e) => setCcRaw(e.target.value)}
                disabled={sending}
                className="min-h-[44px]"
                aria-invalid={!!ccError}
              />
              {ccError && <p className="text-xs text-destructive">{ccError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-bcc">BCC</Label>
              <Input
                id="email-bcc"
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Hidden from other recipients"
                value={bccRaw}
                onChange={(e) => setBccRaw(e.target.value)}
                disabled={sending}
                className="min-h-[44px]"
                aria-invalid={!!bccError}
              />
              {bccError && <p className="text-xs text-destructive">{bccError}</p>}
            </div>
            <p className="text-xs text-muted-foreground">Separate several addresses with commas.</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
