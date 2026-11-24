import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, History, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { processImage } from "@/lib/evidence/imageProcessing";
import type { DigitalIdCredential } from "../hooks/useDigitalCredential";

type CredentialEvent = {
  id: number;
  event_type: string;
  credential_version: number;
  created_at: string;
};

/** Admin-only management area, separate from the customer-facing ID. */
export function DigitalIdAdminTools({
  credential, onChanged,
}: Readonly<{
  credential: DigitalIdCredential;
  onChanged: () => Promise<void>;
}>) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<CredentialEvent[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from("driver_digital_credential_events")
      .select("id, event_type, credential_version, created_at")
      .eq("credential_id", credential.credential_id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      setHistoryError(error.message);
    } else {
      setHistoryError(null);
      setEvents((data ?? []) as CredentialEvent[]);
    }
  }, [credential.credential_id]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const credentialUserId = credential.user_id;

  const updatePhoto = async (path: string | null) => {
    const { error } = await supabase.rpc("set_driver_digital_id_photo", {
      p_user_id: credentialUserId,
      p_photo_path: path,
    });
    if (error) throw error;
  };

  // The target user is resolved from the authenticated response; the backend
  // enforces administrator role and organisation before any mutation.

  const upload = async (file: File) => {
    if (!credential.org_id || !credentialUserId) {
      toast({ title: "Missing organisation", description: "This driver needs an organisation before an ID photo can be uploaded.", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/") || file.size === 0 || file.size > 40 * 1024 * 1024) {
      toast({ title: "Unsupported image", description: "Choose an image smaller than 40 MB. It will be optimised for the card.", variant: "destructive" });
      return;
    }
    setBusy(true);
    let uploadedPath: string | null = null;
    // Once the RPC commits the pointer, the uploaded object is in use.
    // Later UI refresh errors must never delete the live ID photograph.
    let pointerCommitted = false;
    try {
      // Use the existing defensive iOS image pipeline for orientation,
      // downscaling and HEIC-to-JPEG conversion where the browser supports it.
      const processed = await processImage(file);
      if (!processed.width || !processed.height ||
          !["image/jpeg", "image/png", "image/webp"].includes(processed.mimeType) ||
          processed.bytes.byteLength > 5 * 1024 * 1024) {
        throw new Error("This photo could not be converted to a supported image under 5 MB. Try a JPEG.");
      }
      let extension = "jpg";
      if (processed.mimeType === "image/png") extension = "png";
      else if (processed.mimeType === "image/webp") extension = "webp";
      const uploadBlob = new Blob([processed.bytes], { type: processed.mimeType });
      const nonce = crypto.randomUUID();
      uploadedPath = credential.org_id + "/" + credentialUserId + "/" + nonce + "." + extension;
      const { error: storageError } = await supabase.storage
        .from("digital-id-photos")
        .upload(uploadedPath, uploadBlob, { upsert: false, contentType: processed.mimeType });
      if (storageError) throw storageError;
      await updatePhoto(uploadedPath);
      pointerCommitted = true;
      await onChanged();
      await loadEvents();
      toast({ title: "ID photograph updated" });
    } catch (error) {
      // Only an uncommitted upload is orphaned. Do not delete a photo that
      // the credential already points to when a subsequent refresh fails.
      if (uploadedPath && !pointerCommitted) {
        try {
          await supabase.storage.from("digital-id-photos").remove([uploadedPath]);
        } catch {
          // Best-effort orphan cleanup; preserve the original error.
        }
      }
      if (pointerCommitted) {
        toast({
          title: "ID photo saved",
          description: "The photograph was saved, but the page could not refresh. Reload the page to view it.",
        });
      } else {
        toast({ title: "Unable to update ID photo", description: (error as Error).message, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await updatePhoto(null);
      await onChanged();
      await loadEvents();
      toast({ title: "ID photograph removed", description: "The driver will see their initials until another photo is uploaded." });
    } catch (error) {
      toast({ title: "Unable to remove photo", description: (error as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-4" aria-label="Digital ID administration">
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Manage company ID</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Driver number {credential.driver_id} · Version {credential.credential_version}.
        Only administrators can change the company ID photograph.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Select Digital ID photograph"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !credential.org_id}
          onClick={() => input.current?.click()}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          {credential.photo_path ? "Replace photo" : "Upload photo"}
        </Button>
        {credential.photo_path && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void remove()}>
            <Trash2 className="mr-2 h-4 w-4" /> Remove photo
          </Button>
        )}
      </div>
      <div className="border-t border-border pt-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <History className="h-4 w-4" /> Credential history
        </div>
        {historyError && <p role="alert" className="text-xs text-destructive">History unavailable: {historyError}</p>}
        {!historyError && events.length === 0 && <p className="text-xs text-muted-foreground">No history recorded yet.</p>}
        {!historyError && (
          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {events.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="capitalize">{event.event_type.replace(/_/g, " ")} · V{event.credential_version}</span>
                <time className="shrink-0 text-muted-foreground" dateTime={event.created_at}>
                  {new Date(event.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
