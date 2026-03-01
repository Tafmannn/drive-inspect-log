import { toast } from "@/hooks/use-toast";
import { pushToSheet } from "@/lib/sheetSyncApi";
import { logClientEvent } from "@/lib/logger";

/**
 * Wraps pushToSheet with structured error handling, user-facing feedback,
 * and a one-click retry button on the toast.
 */
export async function safePushToSheet(jobIds: string[]): Promise<void> {
  if (!jobIds?.length) return;
  try {
    await pushToSheet(jobIds);
  } catch (err) {
    console.error("Push to Google Sheets failed:", err);

    void logClientEvent("sheet_push_failed", "error", {
      context: { jobIds, error: (err as Error)?.message ?? String(err) },
    });

    toast({
      title: "Sheet sync failed",
      description:
        "The job was saved locally, but syncing to Google Sheets failed. Tap to retry.",
      variant: "destructive",
      duration: 10000,
    });
  }
}
