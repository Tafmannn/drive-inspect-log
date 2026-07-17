import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.functions.invoke("request-password-reset", {
        body: { email: email.trim() },
      });
      if (err) throw err;
      setSent(true);
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
                Reset Password
              </h1>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mt-0.5">
                We'll send you a recovery link
              </p>
            </div>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-5">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-200">Check your inbox</p>
                  <p className="text-xs text-emerald-300/70 mt-1">
                    We sent a password reset link to <span className="font-semibold">{email}</span>.
                  </p>
                </div>
              </div>
              <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs text-[#0c6bbf] hover:text-[#3b9af5] transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-xs text-slate-400">
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="min-h-[44px] pl-9 bg-[#0d1f3f]/60 border-[#1e3f6e]/70 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-[#0c6bbf] focus:ring-[#0c6bbf]/40"
                  />
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
                Send reset link
              </Button>

              <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs text-[#0c6bbf] hover:text-[#3b9af5] transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
