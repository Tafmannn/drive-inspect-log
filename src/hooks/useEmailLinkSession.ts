import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { EmailLinkExpiredError, readEmailLinkToken, redeemEmailLinkToken } from "@/lib/emailLinkToken";

/**
 * Shared by /welcome and /reset-password: works out whether the page was
 * opened from a usable email link, and saves the new password.
 *
 * - Current emails carry ?token_hash=…&type=…: the form shows at once and the
 *   one-time token is redeemed only inside saveNewPassword, so scanners,
 *   link previews and repeat taps can't spend it.
 * - Older emails went via supabase.co, which redirects back with a session
 *   (consumed by supabase-js) or an #error in the hash.
 *
 * hasSession: null = still resolving, false = invalid/expired link, true = show the form.
 */
export function useEmailLinkSession(expiredMessage: string) {
  const { search } = useLocation();
  const [linkToken] = useState(() => readEmailLinkToken(search));
  const redeemed = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(linkToken ? true : null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (linkToken) return;

    // An expired/used link comes back as #error=access_denied&error_code=otp_expired&…
    const hash = window.location.hash;
    if (hash.includes("error=")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const description = params.get("error_description")?.replace(/\+/g, " ");
      setLinkError(description || expiredMessage);
      setHasSession(false);
      return;
    }

    // supabase-js consumes the #access_token=… hash itself (detectSessionInUrl),
    // often before this mounts, so check the session AND listen for sign-in.
    const found = (s: Session | null) => {
      if (!s) return;
      setSession(s);
      setHasSession(true);
    };
    supabase.auth
      .getSession()
      .then(({ data }) => found(data.session))
      .catch(() => {
        // Unreadable session: the timeout below shows the invalid-link message.
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => found(s));

    // If nothing resolves shortly, the page was opened without a valid link.
    const timer = setTimeout(() => {
      setHasSession((current) => (current === null ? false : current));
    }, 2500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [linkToken, expiredMessage]);

  /**
   * Redeems the link's token (once) and sets the password. Resolves to the
   * signed-in session, or null when the token was used/expired (the page then
   * shows the invalid-link message). Other failures throw.
   */
  const saveNewPassword = useCallback(
    async (password: string): Promise<{ session: Session | null } | null> => {
      let current = session;
      if (linkToken && !redeemed.current) {
        try {
          current = await redeemEmailLinkToken(linkToken);
        } catch (err) {
          if (!(err instanceof EmailLinkExpiredError)) throw err;
          setLinkError(err.message);
          setHasSession(false);
          return null;
        }
        redeemed.current = true;
        setSession(current);
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      return { session: current };
    },
    [linkToken, session],
  );

  return { search, fromTokenLink: !!linkToken, hasSession, linkError, session, saveNewPassword };
}

/** The shared new-password rules; null when the pair is acceptable. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password !== confirm) return "Passwords do not match.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  return null;
}
