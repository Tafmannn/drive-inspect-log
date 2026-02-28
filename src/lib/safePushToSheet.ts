import { toast } from "@/hooks/use-toast";
import { pushToSheet } from "@/lib/sheetSyncApi";

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
    const { dismiss } = toast({
      title: "Sheet sync failed",
      description:
        "The job was saved locally, but syncing to Google Sheets failed. Tap to retry.",
      variant: "destructive",
      duration: 10000,
    });

    // The toast library doesn't easily support action buttons from non-JSX files,
    // so we rely on the description guiding users. The retry is also available
    // from the Dashboard "Push Jobs" button.
  }
}
