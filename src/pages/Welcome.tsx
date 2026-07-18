import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";

/**
 * Landing page for invitation links. The branded invite email points here:
 * Supabase verifies the invite/recovery token and redirects with a session in
 * the URL hash, so the new user can create their first password immediately.
 */
export const Welcome = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // null = still resolving; false = no usable session (bad/expired link)
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // An expired/used link comes back as #error=access_denied&error_code=otp_expired&…
    const hash = window.location.hash;
    if (hash.includes("error=")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const description = params.get("error_description")?.replace(/\+/g, " ");
      setLinkError(description || "This invitation link is invalid or has expired.");
      setHasSession(false);
      return;
    }

    // supabase-js consumes the #access_token=…&type=invite hash automatically
    // (detectSessionInUrl) — it may already have done so, or may still be
    // doing it, so check the current session AND listen for SIGNED_IN.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) setHasSession(true);
    });

    // If neither resolves shortly, the page was opened without a valid link.
    const timer = setTimeout(() => {
      setHasSession((current) => (current === null ? false : current));
    }, 2500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setSuccess(true);
      setTimeout(() => navigate("/", { replace: true }), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 0%, rgba(35,120,220,0.35), transparent 70%), " +
          "radial-gradient(55% 45% at 85% 100%, rgba(20,90,190,0.28), transparent 70%), " +
          "linear-gradient(180deg, #0b1c3f 0%, #071431 55%, #040c22 100%)",
      }}
    >
      <div className="w-full max-w-md px-4">
        <div className="backdrop-blur-xl bg-[#0a1a35]/55 border border-white/10 rounded-2xl shadow-[0_30px_60px_rgba(3,9,28,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] p-8 space-y-7">
          <div className="flex flex-col items-center gap-4">
            <img
              src="/axentra-logo-lockup.webp"
              alt="Axentra"
              className="w-40 h-auto drop-shadow-[0_8px_28px_rgba(24,110,225,0.4)]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="text-center">
              <h1 className="text-[22px] font-semibold tracking-wide text-slate-200">
                Welcome to Axentra
              </h1>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mt-0.5">
                Create your password to get started
              </p>
            </div>
          </div>

          {success ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-5">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-emerald-200">Password created</p>
                <p className="text-xs text-emerald-300/70 mt-1">Taking you to the app…</p>
              </div>
            </div>
          ) : hasSession === null ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying your invitation…
            </div>
          ) : hasSession === false ? (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
              {linkError ??
                "This invitation link is invalid or has expired. Please ask your administrator to send a new invite."}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs text-slate-400">
                    Choose a password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="min-h-[44px] pl-9 bg-[#0d1f3f]/60 border-[#1e3f6e]/70 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-[#0c6bbf] focus:ring-[#0c6bbf]/40"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-xs text-slate-400">
                    Confirm password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="min-h-[44px] pl-9 bg-[#0d1f3f]/60 border-[#1e3f6e]/70 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-[#0c6bbf] focus:ring-[#0c6bbf]/40"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] text-[0.95rem] font-medium bg-gradient-to-b from-[#1678d6] to-[#0b5da0] hover:from-[#1b80e3] hover:to-[#0c66ad] text-white rounded-lg shadow-[0_12px_30px_rgba(12,107,191,0.45)] hover:-translate-y-[1px] transition-all"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create password &amp; continue
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
