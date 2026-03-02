import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Mail } from "lucide-react";

export const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        setSignupSuccess(true);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "signin" ? "Sign in" : "Create your account";
  const subtitle =
    mode === "signin"
      ? "Enter your Axentra driver credentials to continue."
      : "Register a new Axentra driver account to get started.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6">
          {/* Brand lockup */}
          <div className="flex items-center justify-center gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-blue-500/10 border border-blue-500/40 flex items-center justify-center shadow-sm shadow-blue-900/40">
                <img
                  src="/axentra-logo.png"
                  alt="Axentra"
                  className="h-6 w-auto"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Axentra Vehicles
                </span>
                <span className="text-sm font-medium text-slate-100">
                  Driver & Admin Portal
                </span>
              </div>
            </div>
          </div>

          <Card className="bg-slate-950/80 border-slate-800 shadow-xl shadow-blue-950/40 backdrop-blur">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="text-2xl font-semibold text-slate-50">
                {title}
              </CardTitle>
              <CardDescription className="text-slate-400 text-sm">
                {subtitle}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {signupSuccess ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  <p className="font-medium mb-1">Check your email</p>
                  <p className="text-xs text-emerald-100/80">
                    We sent a confirmation link to{" "}
                    <span className="font-semibold">{email}</span>. Click it to
                    activate your account, then sign in.
                  </p>
                </div>
              ) : null}

              {!signupSuccess && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs text-slate-300">
                        Email address
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          autoComplete="email"
                          className="min-h-[44px] pl-9 bg-slate-950/60 border-slate-700 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-xs text-slate-300">
                        Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          autoComplete={
                            mode === "signin" ? "current-password" : "new-password"
                          }
                          className="min-h-[44px] pl-9 bg-slate-950/60 border-slate-700 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full min-h-[44px] text-[0.95rem]"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {mode === "signin" ? "Sign in" : "Create account"}
                  </Button>
                </form>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition-colors"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setSignupSuccess(false);
                }}
              >
                {mode === "signin" ? (
                  <>
                    Don&apos;t have an account?{" "}
                    <span className="text-blue-400 font-medium">Create one</span>
                  </>
                ) : (
                  <>
                    Already registered?{" "}
                    <span className="text-blue-400 font-medium">Sign in</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-500 text-center">
                Secure access powered by Supabase &amp; the Axentra Intelligence Engine.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};
