import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Mail, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { TEST_CREDENTIALS, hasTestCredentials } from "@/dev/testCredentials";

export const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextRaw = searchParams.get("next");
  const next = nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : null;
  const { authEnabled, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (authEnabled && user) {
      navigate(next ?? "/", { replace: true });
    }
  }, [authEnabled, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      navigate(next ?? "/", { replace: true });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
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
        {/* Card */}
        <div className="backdrop-blur-xl bg-[#0a1a35]/55 border border-white/10 rounded-2xl shadow-[0_30px_60px_rgba(3,9,28,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] p-8 space-y-7">
          {/* Brand */}
          <div className="flex flex-col items-center">
            <img
              src="/axentra-logo-lockup.webp"
              alt="Axentra — Precision in Every Move"
              className="w-64 h-auto drop-shadow-[0_8px_28px_rgba(24,110,225,0.4)]"
              onError={(e) => {
                (e.target as HTMLImageElement).outerHTML =
                  '<div class="text-center"><h1 class="text-[22px] font-semibold tracking-wide text-slate-100">AXENTRA</h1><p class="text-[11px] uppercase tracking-[0.22em] text-slate-400 mt-0.5">Precision in Every Move</p></div>';
              }}
            />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-xs text-slate-400">
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="login-email"
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

              <div className="space-y-1.5">
                <Label htmlFor="login-password" className="text-xs text-slate-400">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="current-password"
                    className="min-h-[44px] pl-9 bg-[#0d1f3f]/60 border-[#1e3f6e]/70 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-[#0c6bbf] focus:ring-[#0c6bbf]/40"
                  />
                </div>
              </div>
            </div>

            {/* Remember / Forgot */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                  className="border-[#2a4d80] data-[state=checked]:bg-[#0c6bbf] data-[state=checked]:border-[#0c6bbf]"
                />
                <Label htmlFor="remember" className="text-xs text-slate-400 cursor-pointer">
                  Remember me
                </Label>
              </div>
              <Link
                to="/forgot-password"
                className="text-xs text-[#0c6bbf] hover:text-[#3b9af5] transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] text-[0.95rem] font-medium bg-gradient-to-b from-[#1678d6] to-[#0b5da0] hover:from-[#1b80e3] hover:to-[#0c66ad] text-white rounded-lg shadow-[0_12px_30px_rgba(12,107,191,0.45)] hover:-translate-y-[1px] transition-all"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sign in
            </Button>

            {/* Dev-only quick fill */}
            {import.meta.env.DEV && hasTestCredentials() && (
              <button
                type="button"
                onClick={() => {
                  setEmail(TEST_CREDENTIALS.email);
                  setPassword(TEST_CREDENTIALS.password);
                }}
                className="w-full text-[11px] uppercase tracking-[0.18em] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Fill test credentials (dev)
              </button>
            )}
          </form>

          {/* Footer */}
          <p className="text-[11px] text-slate-600 text-center">
            Secure access powered by Supabase &amp; the Axentra Intelligence Engine.
          </p>
        </div>
      </div>
    </div>
  );
};
