import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";

export const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);

  useEffect(() => {
    // Supabase appends #access_token=...&type=recovery to the URL
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setHasRecovery(true);
    }

    // Also listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setHasRecovery(true);
      }
    });
    return () => subscription.unsubscribe();
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
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05070b] bg-[radial-gradient(circle_at_top,rgba(22,119,255,0.25)_0,transparent_55%)]">
      <div className="w-full max-w-md px-4">
        <div className="backdrop-blur-xl bg-black/60 border border-white/5 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] p-8 space-y-7">
          <div className="flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-[#0c6bbf]/15 border border-[#0c6bbf]/30 flex items-center justify-center">
              <img src="/axentra-logo.png" alt="Axentra" className="h-8 w-auto"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).parentElement!.innerHTML =
                    '<span class="text-2xl font-bold text-white">A</span>';
                }}
              />
            </div>
            <div className="text-center">
              <h1 className="text-[22px] font-semibold tracking-wide text-slate-200">
                Set New Password
              </h1>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mt-0.5">
                Choose a strong password
              </p>
            </div>
          </div>

          {success ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-5">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-emerald-200">Password updated</p>
                <p className="text-xs text-emerald-300/70 mt-1">Redirecting to sign in…</p>
              </div>
            </div>
          ) : !hasRecovery ? (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
              This link is invalid or has expired. Please request a new password reset from the login page.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs text-slate-400">
                    New password
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
                      className="min-h-[44px] pl-9 bg-slate-900/60 border-slate-700/70 rounded-lg text-slate-100 placeholder:text-slate-600 focus:border-[#0c6bbf] focus:ring-[#0c6bbf]/40"
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
                      className="min-h-[44px] pl-9 bg-slate-900/60 border-slate-700/70 rounded-lg text-slate-100 placeholder:text-slate-600 focus:border-[#0c6bbf] focus:ring-[#0c6bbf]/40"
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
                className="w-full min-h-[44px] text-[0.95rem] font-medium bg-[#0c6bbf] hover:bg-[#0a5da8] text-white rounded-lg shadow-[0_12px_30px_rgba(12,107,191,0.45)] hover:-translate-y-[1px] transition-all"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
