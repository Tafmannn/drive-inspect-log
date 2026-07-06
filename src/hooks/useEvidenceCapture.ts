/**
 * useEvidenceCapture — capture-time evidence saving for the inspection flow.
 *
 * When EVIDENCE_V2_ENABLED is on, a captured photo is durably saved to
 * IndexedDB the moment the driver accepts it and a background upload is
 * kicked — the driver never waits. When off (default), callers fall back to
 * the legacy stage-at-submit pipeline unchanged.
 *
 * `replaceCategory` gives standard shots retake semantics: re-capturing the
 * same category removes the superseded NOT-yet-uploaded item first (already-
 * uploaded evidence is never deleted — evidence is append-only once on the
 * server).
 */

import { useCallback, useEffect, useState } from "react";
import { isFeatureEnabled } from "@/lib/featureFlags";
import {
  getItem,
  listByJobStageCategory,
  remove,
  saveCapture,
} from "@/lib/evidence/evidenceStore";
import { drainEvidenceQueue } from "@/lib/evidence/queueRuntime";
import type {
  CaptureInput,
  EvidenceCategory,
  EvidenceItem,
  EvidenceStage,
} from "@/lib/evidence/types";

export interface EvidenceCaptureArgs extends Omit<CaptureInput, "file"> {
  /** Retake semantics: supersede prior non-uploaded items of this category. */
  replaceCategory?: boolean;
}

export function useEvidenceCapture() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    isFeatureEnabled("EVIDENCE_V2_ENABLED").then((v) => {
      if (mounted) setEnabled(v);
    });
    return () => { mounted = false; };
  }, []);

  const capture = useCallback(
    async (file: File, args: EvidenceCaptureArgs): Promise<EvidenceItem> => {
      if (args.replaceCategory) {
        const prior = await listByJobStageCategory(
          args.jobId,
          args.stage as EvidenceStage,
          args.category as EvidenceCategory,
        );
        await Promise.all(
          prior
            .filter((e) => e.uploadStatus !== "uploaded")
            .map((e) => remove(e.localId).catch(() => {})),
        );
      }
      const item = await saveCapture({ ...args, file });
      void drainEvidenceQueue(); // background — never awaited by the UI
      return item;
    },
    [],
  );

  /** Remove a captured item if (and only if) it has not reached the server. */
  const removeIfNotUploaded = useCallback(async (localId: string) => {
    const item = await getItem(localId);
    if (item && item.uploadStatus !== "uploaded") {
      await remove(localId).catch(() => {});
    }
  }, []);

  return { enabled, capture, removeIfNotUploaded };
}
