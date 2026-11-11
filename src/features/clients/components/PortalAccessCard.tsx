/**
 * Admin card on the client profile: invite this client's contacts to the
 * customer portal and manage their logins. All actions go through the
 * portal-access edge function, which re-checks that the caller is an admin of
 * this client's org and that every target is a portal login of THIS client.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2, Mail, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

interface PortalUser {
  auth_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  account_status: "active" | "suspended" | "pending_activation";
  last_sign_in_at: string | null;
}

interface ListResponse {
  users: PortalUser[];
  linked_jobs: number;
  client_active: boolean;
}

async function portalAccess<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("portal-access", { body });
  if (error) {
    // Surface the function's own message (e.g. "already has portal access").
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  return data as T;
}

export function PortalAccessCard({
  clientId,
  defaultName,
  defaultEmail,
}: {
  clientId: string;
  defaultName?: string | null;
  defaultEmail?: string | null;
}) {
  const qc = useQueryClient();
  const queryKey = ["portal-access", clientId];
  const [first, ...rest] = (defaultName ?? "").trim().split(/\s+/);
  const [firstName, setFirstName] = useState(first ?? "");
  const [lastName, setLastName] = useState(rest.join(" "));
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [showInvite, setShowInvite] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PortalUser | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => portalAccess<ListResponse>({ action: "list", client_id: clientId }),
    staleTime: 30_000,
  });

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => portalAccess<{ invite_email?: string }>({ client_id: clientId, ...body }),
    onSuccess: (res, body) => {
      void qc.invalidateQueries({ queryKey });
      const messages: Record<string, string> = {
        invite: res?.invite_email === "failed"
          ? "Portal login created, but the invite email didn't send — use “Send link” to retry."
          : "Invite sent.",
        resend: "A new sign-in link has been emailed.",
        suspend: "Portal access suspended.",
        reactivate: "Portal access restored.",
        remove: "Portal login removed.",
      };
      toast({ title: messages[String(body.action)] ?? "Done" });
      if (body.action === "invite") {
        setShowInvite(false);
        setEmail("");
        setFirstName("");
        setLastName("");
      }
    },
    onError: (e) => toast({ title: "Something went wrong", description: (e as Error).message, variant: "destructive" }),
  });

  const pendingFor = (userId: string, action: string) =>
    act.isPending && act.variables?.user_id === userId && act.variables?.action === action;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4" /> Customer portal access</CardTitle>
        <p className="text-xs text-muted-foreground">
          Lets this client track their vehicle moves, see delivery photos and signatures, and download invoices.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-xs text-destructive">Couldn't load portal access: {(error as Error).message}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{data?.linked_jobs ?? 0}</span> job
              {data?.linked_jobs === 1 ? " is" : "s are"} linked to this client and will appear in their portal.
              Jobs only appear once they're linked to this client record.{" "}
              <Link to="/control/clients/link-jobs" className="text-primary underline-offset-2 hover:underline">
                Link jobs
              </Link>
            </p>

            {(data?.users.length ?? 0) > 0 && (
              <ul className="divide-y divide-border/60 border border-border/60 rounded-md">
                {data!.users.map((u) => {
                  const name = u.display_name || [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
                  const status = u.account_status === "suspended" ? "Suspended" : u.last_sign_in_at ? "Active" : "Invited";
                  return (
                    <li key={u.auth_user_id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={status === "Suspended" ? "secondary" : "outline"} className="text-[10px]">{status}</Badge>
                        {u.account_status !== "suspended" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={act.isPending}
                            onClick={() => act.mutate({ action: "resend", user_id: u.auth_user_id })}>
                            {pendingFor(u.auth_user_id, "resend") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3 mr-1" />}
                            Send link
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={act.isPending}
                          onClick={() => act.mutate({ action: u.account_status === "suspended" ? "reactivate" : "suspend", user_id: u.auth_user_id })}>
                          {u.account_status === "suspended" ? "Reactivate" : "Suspend"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={act.isPending}
                          onClick={() => setRemoveTarget(u)}>
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {!data?.client_active ? (
              <p className="text-xs text-muted-foreground">This client is archived — reactivate it to invite portal users.</p>
            ) : showInvite ? (
              <form
                className="space-y-2 border border-border/60 rounded-md p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  act.mutate({ action: "invite", email, first_name: firstName, last_name: lastName });
                }}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="portal-first" className="text-xs">First name</Label>
                    <Input id="portal-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="portal-last" className="text-xs">Last name</Label>
                    <Input id="portal-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="portal-email" className="text-xs">Email</Label>
                  <Input id="portal-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowInvite(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={act.isPending || !email.trim()}>
                    {act.isPending && act.variables?.action === "invite" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Send invite
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowInvite(true)}>
                <UserPlus className="w-4 h-4 mr-1.5" /> Invite to portal
              </Button>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove portal login?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.email} will no longer be able to sign in. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeTarget) act.mutate({ action: "remove", user_id: removeTarget.auth_user_id });
                setRemoveTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
