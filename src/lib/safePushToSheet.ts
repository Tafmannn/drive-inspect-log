import { toast } from "@/hooks/use-toast";
import { pushToSheet } from "@/lib/sheetSyncApi";

/**
 * Wraps pushToSheet with structured error handling and user-facing feedback.
 * All fire-and-forget sheet syncs should use this instead of raw pushToSheet().catch(() => {}).
 */
export async function safePushToSheet(jobIds: string[]): Promise<void> {
  if (!jobIds?.length) return;
  try {
    await pushToSheet(jobIds);
  } catch (err) {
    console.error("Push to Google Sheets failed:", err);
    toast({
      title: "Sheet sync failed",
      description:
        "The job was saved locally, but syncing to Google Sheets failed. You can retry from the Jobs page.",
      variant: "destructive",
    });
  }
}
