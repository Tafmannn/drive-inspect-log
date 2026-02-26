// src/hooks/useJobs.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { Job, InspectionType, Inspection, DamageItem } from "@/lib/types";

// … keep the queries above as they are …

export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<Job, "id" | "created_at" | "updated_at">) => {
      try {
        const job = await api.createJob(input);
        return job;
      } catch (e: unknown) {
        // Log to console so we can see the real supabase error in Lovable
        // (open the DevTools / console tab when you press "Create Job").
        // eslint-disable-next-line no-console
        console.error("[createJob] error", e);

        // Normalise various error shapes into a readable message
        if (e instanceof Error) {
          throw e;
        }

        if (typeof e === "string") {
          throw new Error(e);
        }

        if (e && typeof e === "object") {
          const anyErr = e as any;
          const message =
            anyErr.message ||
            anyErr.error ||
            anyErr.details ||
            anyErr.hint ||
            JSON.stringify(anyErr);

          throw new Error(message || "Job creation failed");
        }

        throw new Error("Job creation failed");
      }
    },
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", job.id] });
    },
  });
}