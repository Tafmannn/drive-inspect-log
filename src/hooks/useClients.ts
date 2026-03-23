import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listClients,
  createClient,
  updateClient,
  archiveClient,
  restoreClient,
  getClientStats,
  linkJobToClient,
  type ClientInsert,
  type ClientUpdate,
} from "@/lib/clientApi";

const CLIENTS_KEY = ["clients"];
const CLIENT_STATS_KEY = ["client-stats"];

export function useClients(opts?: { search?: string; includeArchived?: boolean }) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, opts?.search ?? "", opts?.includeArchived ?? false],
    queryFn: () => listClients(opts),
    staleTime: 30_000,
  });
}

export function useClientStats() {
  return useQuery({
    queryKey: CLIENT_STATS_KEY,
    queryFn: getClientStats,
    staleTime: 30_000,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientInsert) => createClient(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENTS_KEY });
      qc.invalidateQueries({ queryKey: CLIENT_STATS_KEY });
    },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClientUpdate }) =>
      updateClient(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENTS_KEY });
    },
  });
}

export function useArchiveClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveClient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENTS_KEY });
      qc.invalidateQueries({ queryKey: CLIENT_STATS_KEY });
    },
  });
}

export function useRestoreClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreClient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENTS_KEY });
      qc.invalidateQueries({ queryKey: CLIENT_STATS_KEY });
    },
  });
}

export function useLinkJobToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, clientId }: { jobId: string; clientId: string | null }) =>
      linkJobToClient(jobId, clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
