import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * One-time token carried by our own email links
 * (/welcome?token_hash=…&type=invite, /reset-password?token_hash=…&type=recovery).
 * The page only redeems it when the person submits their new password, so
 * email scanners, link previews and repeat taps can't use it up.
 */
export interface EmailLinkToken {
  tokenHash: string;
  type: EmailOtpType;
}

const TYPES: readonly EmailOtpType[] = ["invite", "recovery", "magiclink", "signup", "email", "email_change"];

export function readEmailLinkToken(search: string): EmailLinkToken | null {
  const params = new URLSearchParams(search);
  const tokenHash = params.get("token_hash")?.trim();
  const type = params.get("type") as EmailOtpType | null;
  if (!tokenHash || !type || !TYPES.includes(type)) return null;
  return { tokenHash, type };
}

export class EmailLinkExpiredError extends Error {}

/** Exchanges the token for a session. Throws EmailLinkExpiredError if it's used or expired. */
export async function redeemEmailLinkToken(token: EmailLinkToken): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: token.tokenHash, type: token.type });
  if (error || !data.session) {
    throw new EmailLinkExpiredError(
      "This link has expired or has already been used. Links only work once — ask for a new one.",
    );
  }
  return data.session;
}
