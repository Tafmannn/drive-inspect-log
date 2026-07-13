import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type AnySupabase = typeof supabase & {
  auth: {
    oauth?: {
      getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
      approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
      denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
    };
  };
};

function isSameOriginPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      const oauth = (supabase as AnySupabase).auth.oauth;
      if (!oauth) {
        setError("OAuth server not enabled on this Supabase project.");
        return;
      }
      const { data, error: err } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (err) return setError(err.message ?? String(err));
      const d: any = data;
      const immediate = d?.redirect_url ?? d?.redirect_to;
      if (immediate && !d?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const oauth = (supabase as AnySupabase).auth.oauth;
    if (!oauth) {
      setBusy(false);
      setError("OAuth server not enabled on this Supabase project.");
      return;
    }
    const { data, error: err } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (err) {
      setBusy(false);
      setError(err.message ?? String(err));
      return;
    }
    const target = (data as any)?.redirect_url ?? (data as any)?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold text-destructive">Authorization error</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }
  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    );
  }

  const clientName = details.client?.name ?? "an external app";

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full space-y-6 rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Connect {clientName} to Axentra</h1>
          <p className="text-sm text-muted-foreground">
            {clientName} is requesting to access Axentra as you. It will be able to use
            the Axentra MCP tools on your behalf, scoped to your organisation and role.
          </p>
        </div>
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
          </Button>
          <Button
            disabled={busy}
            onClick={() => decide(false)}
            variant="outline"
            className="flex-1"
          >
            Deny
          </Button>
        </div>
      </div>
    </main>
  );
}
