import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  isPushSupported,
  getPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/pushApi";

const DISMISS_KEY = "push-optin-dismissed";

/**
 * "Get notified when a job is assigned" opt-in.
 *
 * variant="card": always shown (Profile) with subscribe/unsubscribe state.
 * variant="prompt": one-time dismissible nudge (jobs list) — hidden once
 * dismissed, subscribed, or when permission was already denied.
 */
export function PushOptIn({ variant = "card" }: { variant?: "card" | "prompt" }) {
  const { user } = useAuth();
  const [supported] = useState(isPushSupported);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => variant === "prompt" && localStorage.getItem(DISMISS_KEY) === "1",
  );

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void getPushSubscription().then((sub) => {
      if (!cancelled) setSubscribed(!!sub);
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  if (!supported || !user?.id || dismissed) return null;
  if (
    variant === "prompt" &&
    (subscribed !== false || Notification.permission === "denied")
  ) {
    return null;
  }

  const enable = async () => {
    setBusy(true);
    const result = await subscribeToPush(user.id);
    setBusy(false);
    if (result === "subscribed") {
      setSubscribed(true);
      toast({ title: "Notifications on", description: "You'll be notified when a job is assigned to you." });
    } else if (result === "denied") {
      toast({
        title: "Notifications blocked",
        description: "Allow notifications for this app in your device settings to turn them on.",
      });
    } else {
      toast({ title: "Couldn't enable notifications", description: "Please try again.", variant: "destructive" });
    }
  };

  const disable = async () => {
    setBusy(true);
    await unsubscribeFromPush();
    setBusy(false);
    setSubscribed(false);
    toast({ title: "Notifications off" });
  };

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {subscribed ? (
            <Bell className="w-5 h-5 text-primary" />
          ) : (
            <BellOff className="w-5 h-5 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Job notifications</p>
          <p className="text-xs text-muted-foreground">
            {subscribed
              ? "This device is notified when a job is assigned to you."
              : "Get notified on this device when a job is assigned to you."}
          </p>
        </div>
        {variant === "prompt" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, "1");
              setDismissed(true);
            }}
          >
            Not now
          </Button>
        )}
        {subscribed ? (
          variant === "card" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void disable()}>
              Turn off
            </Button>
          )
        ) : (
          <Button size="sm" disabled={busy || subscribed === null} onClick={() => void enable()}>
            Turn on
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
