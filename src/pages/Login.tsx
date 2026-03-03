import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Mail, Lock } from "lucide-react";

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05070b] bg-[radial-gradient(circle_at_top,rgba(22,119,255,0.25)_0,transparent_55%)]">
      <div className="w-full max-w-md px-4">
        {/* Card */}
        <div className="backdrop-blur-xl bg-black/60 border border-white/5 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] p-8 space-y-7">
          {/* Brand */}
          <div className="flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-[#0c6bbf]/15 border border-[#0c6bbf]/30 flex items-center justify-center">
              <img
                src="/axentra-logo.png"
                alt="Axentra"
                className="h-8 w-auto"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).parentElement!.innerHTML =
                    '<span class="text-2xl font-bold text-white">A</span>';
                }}
              />
            </div>
            <div className="text-center">
              <h1 className="text-[22px] font-semibold tracking-wide text-slate-200">
                AXENTRA
              </h1>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mt-0.5">
                Precision in Every Move
              </p>
            </div>
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
                    className="min-h-[44px] pl-9 bg-slate-900/60 border-slate-700/70 rounded-lg text-slate-100 placeholder:text-slate-600 focus:border-[#0c6bbf] focus:ring-[#0c6bbf]/40"
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
                    className="min-h-[44px] pl-9 bg-slate-900/60 border-slate-700/70 rounded-lg text-slate-100 placeholder:text-slate-600 focus:border-[#0c6bbf] focus:ring-[#0c6bbf]/40"
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
                  className="border-slate-600 data-[state=checked]:bg-[#0c6bbf] data-[state=checked]:border-[#0c6bbf]"
                />
                <Label htmlFor="remember" className="text-xs text-slate-400 cursor-pointer">
                  Remember me
                </Label>
              </div>
              <button
                type="button"
                className="text-xs text-[#0c6bbf] hover:text-[#3b9af5] transition-colors"
                onClick={() => {}}
              >
                Forgot password?
              </button>
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
              className="w-full min-h-[44px] text-[0.95rem] font-medium bg-[#0c6bbf] hover:bg-[#0a5da8] text-white rounded-lg shadow-[0_12px_30px_rgba(12,107,191,0.45)] hover:-translate-y-[1px] transition-all"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sign in
            </Button>
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
