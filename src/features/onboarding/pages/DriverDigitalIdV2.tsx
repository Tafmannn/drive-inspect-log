/**
 * Axentra Digital ID V2. Company-issued identification, not an independent
 * identity verification document. Job information is intentionally separate.
 */
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Info, Loader2, RefreshCw, ShieldOff, WifiOff } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { DriverIdCard } from "../components/DriverIdCardV2";
import { DigitalIdAdminTools } from "../components/DigitalIdAdminTools";
import { useDigitalCredential } from "../hooks/useDigitalCredential";
import { useDigitalIdPhotoUrl } from "../hooks/useDigitalIdPhotoUrl";

export default function DriverDigitalIdV2() {
  const navigate = useNavigate();
  const { userId: targetUserId } = useParams<{ userId: string }>();
  const { user, isAdmin } = useAuth();
  const isAdminView = Boolean(targetUserId);
  const userId = targetUserId || user?.id || "";
  const backTarget = isAdminView ? "/admin/drivers/" + userId : "/profile";
  const { credential, status, error, refresh } = useDigitalCredential(userId);
  const photoUrl = useDigitalIdPhotoUrl(credential?.photo_path);

  const showCard = credential && (
    status === "active" || status === "grace" || (isAdminView && status === "revoked")
  );
  const isLoading = status === "loading";
  const isMissing = status === "missing";
  const revoked = status === "revoked";
  const unavailable = status === "unavailable";
  let StatusIcon = AlertTriangle;
  let statusHeading = "Digital ID unavailable";
  let statusMessage = "Your company ID will be issued when your driver account is activated.";
  if (revoked) {
    StatusIcon = ShieldOff;
    statusHeading = "Company ID unavailable";
    statusMessage = "This account cannot present an active Axentra company ID. Contact your administrator.";
  } else if (unavailable) {
    StatusIcon = WifiOff;
    statusHeading = "Unable to confirm authorisation";
    statusMessage = "An up-to-date company status could not be confirmed. Connect to the internet and try again.";
  } else if (isMissing) {
    statusHeading = "No Digital ID issued yet";
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <AppHeader title="Digital ID" showBack onBack={() => navigate(backTarget)} />

      <main className="mx-auto w-full max-w-[460px] px-4 pb-4 pt-5">
        <div className="mb-5">
          <p className="text-xs text-muted-foreground">
            Professional Axentra company identification for customer checks
          </p>
        </div>

        {isLoading && (
          <output className="flex min-h-52 items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Checking your company ID…
          </output>
        )}

        {!isLoading && !showCard && (
          <div role="alert" className="rounded-2xl border border-border bg-card px-5 py-8 text-center shadow-sm">
            <StatusIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h1 className="text-base font-semibold">{statusHeading}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{statusMessage}</p>
            {error && isAdminView && <p className="mt-2 break-words text-xs text-destructive">{error}</p>}
            {!revoked && (
              <Button variant="outline" className="mt-4" onClick={() => void refresh()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Try again
              </Button>
            )}
          </div>
        )}

        {showCard && credential && (
          <>
            {status === "grace" && (
              <output className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-900">
                <WifiOff className="h-4 w-4 shrink-0" />
                Connection lost. Showing the last known company status briefly.
              </output>
            )}
            {status === "revoked" && isAdminView && (
              <output className="mb-3 flex items-center gap-2 rounded-xl border border-red-300/40 bg-red-50 p-3 text-xs text-red-900">
                <ShieldOff className="h-4 w-4 shrink-0" /> Historical admin view. This credential is not valid.
              </output>
            )}
            <DriverIdCard credential={credential} displayStatus={status} photoUrl={photoUrl} />
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-slate-700">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
              <p className="text-center text-xs leading-relaxed sm:text-sm">
                This card identifies an Axentra driver and displays the current company authorisation status.
                It is not an independent identity or driving-licence verification.
              </p>
            </div>

            {isAdminView && isAdmin && (
              <DigitalIdAdminTools credential={credential} onChanged={refresh} />
            )}

            {isAdminView && isAdmin && !credential.company_phone && (
              <p role="note" className="mt-3 text-xs text-amber-700">
                Company contact number is not yet configured in the organisation record.
                Add it before releasing the customer-facing card.
              </p>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
