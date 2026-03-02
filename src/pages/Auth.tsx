import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Brand bar */}
      <div className="h-11 bg-[hsl(216,100%,40%)] flex items-center justify-center px-4">
        <div className="flex items-center gap-2">
          <img
            src="/axentra-logo.png"
            alt="Axentra"
            className="h-5 w-auto brightness-0 invert"
          />
          <span className="text-[14px] font-semibold text-white tracking-tight">
            Axentra Vehicles
          </span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-foreground">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signin"
                ? "Sign in to your driver account"
                : "Register for a new account"}
            </p>
          </div>

          {signupSuccess ? (
            <div className="rounded-lg border border-border bg-card p-4 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">Check your email</p>
              <p className="text-xs text-muted-foreground">
                We sent a confirmation link to <strong>{email}</strong>. Click it to
                activate your account, then sign in.
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setSignupSuccess(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="min-h-[44px]"
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="min-h-[44px]"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full min-h-[44px]" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Sign up"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                  }}
                >
                  {mode === "signin" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
