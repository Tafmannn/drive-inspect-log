import { supabase } from '@/integrations/supabase/client';
import type {
  Job,
  JobWithRelations,
  Inspection,
  DamageItem,
  Photo,
  JobActivityLog,
  InspectionType,
} from './types';
import type { JobStatusValue } from './statusConfig';
import { JOB_STATUS, ACTIVE_STATUSES, PENDING_STATUSES } from './statusConfig';
import { isFeatureEnabled } from './featureFlags';
import { logClientEvent } from './logger';

// ─── Sheet Sync Helper ───────────────────────────────────────────────

async function syncJobToSheetIfEnabled(jobId: string): Promise<void> {
  try {
    const { safePushToSheet } = await import("./safePushToSheet");
    void safePushToSheet([jobId]); // fire-and-forget
  } catch {
    // allow silent fail – error is already handled by safePushToSheet
  }
}

// ─── Jobs ────────────────────────────────────────────────────────────

export async function listJobs(filter?: { statuses?: string[] }): Promise<Job[]> {
  let query = supabase.from('jobs').select('*').eq('is_hidden', false).order('job_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  if (filter?.statuses?.length) {
    query = query.in('status', filter.statuses);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Job[];
}

export async function listActiveJobs(): Promise<Job[]> {
  return listJobs({ statuses: ACTIVE_STATUSES as string[] });
}

export async function listCompletedJobs(): Promise<Job[]> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('is_hidden', false)
    .not('completed_at', 'is', null)
    .gte('completed_at', fourteenDaysAgo.toISOString())
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Job[];
}

export async function listPendingJobs(): Promise<Job[]> {
  return listJobs({ statuses: PENDING_STATUSES as string[] });
}

export async function getJob(jobId: string): Promise<Job> {
  const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (error) throw error;
  return data as Job;
}

export async function getJobWithRelations(jobId: string): Promise<JobWithRelations> {
  const [jobRes, inspRes, photoRes, actRes] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', jobId).single(),
    supabase.from('inspections').select('*').eq('job_id', jobId),
    supabase.from('photos').select('*').eq('job_id', jobId),
    supabase.from('job_activity_log').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
  ]);
  if (jobRes.error) throw jobRes.error;

  const inspections = (inspRes.data ?? []) as Inspection[];
  const inspectionIds = inspections.map((i) => i.id);

  let damageItems: DamageItem[] = [];
  if (inspectionIds.length > 0) {
    const { data } = await supabase.from('damage_items').select('*').in('inspection_id', inspectionIds);
    damageItems = (data ?? []) as DamageItem[];
  }

  return {
    ...(jobRes.data as Job),
    inspections,
    photos: (photoRes.data ?? []) as Photo[],
    damage_items: damageItems,
    activity_log: (actRes.data ?? []) as JobActivityLog[],
  };
}

async function generateJobNumber(): Promise<string> {
  const { data } = await supabase
    .from('jobs')
    .select('external_job_number')
    .like('external_job_number', 'AX%')
    .order('external_job_number', { ascending: false })
    .limit(1);

  let next = 1;
  if (data && data.length > 0 && data[0].external_job_number) {
    const match = data[0].external_job_number.match(/^AX(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `AX${String(next).padStart(4, '0')}`;
}

export async function createJob(input: Partial<Omit<Job, 'id' | 'status' | 'has_pickup_inspection' | 'has_delivery_inspection' | 'completed_at' | 'created_at' | 'updated_at'>> & Pick<Job, 'vehicle_reg' | 'vehicle_make' | 'vehicle_model' | 'vehicle_colour' | 'pickup_contact_name' | 'pickup_contact_phone' | 'pickup_address_line1' | 'pickup_city' | 'pickup_postcode' | 'delivery_contact_name' | 'delivery_contact_phone' | 'delivery_address_line1' | 'delivery_city' | 'delivery_postcode'>): Promise<Job> {
  const payload = { ...input };
  if (!payload.external_job_number) {
    (payload as Record<string, unknown>).external_job_number = await generateJobNumber();
  }
  const { data, error } = await supabase.from('jobs').insert(payload).select().single();
  if (error) throw error;
  await logJobActivity(data.id, 'job_created', undefined, JOB_STATUS.READY_FOR_PICKUP);
  return data as Job;
}

export async function updateJob(jobId: string, input: Partial<Job>): Promise<Job> {
  const { data, error } = await supabase.from('jobs').update(input).eq('id', jobId).select().single();
  if (error) throw error;
  return data as Job;
}

// ─── Archive ─────────────────────────────────────────────────────────

export async function archiveJob(jobId: string): Promise<void> {
  const { error } = await supabase.from('jobs').update({ is_hidden: true } as any).eq('id', jobId);
  if (error) throw error;
}

export async function restoreJob(jobId: string): Promise<void> {
  const { error } = await supabase.from('jobs').update({ is_hidden: false } as any).eq('id', jobId);
  if (error) throw error;
}

// ─── Inspections ─────────────────────────────────────────────────────

export async function getInspection(jobId: string, type: InspectionType): Promise<Inspection | null> {
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('job_id', jobId)
    .eq('type', type)
    .maybeSingle();
  if (error) throw error;
  return data as Inspection | null;
}

export async function upsertInspection(
  jobId: string,
  type: InspectionType,
  payload: Partial<Inspection>
): Promise<Inspection> {
  const existing = await getInspection(jobId, type);

  if (existing) {
    const { data, error } = await supabase
      .from('inspections')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as Inspection;
  } else {
    const { data, error } = await supabase
      .from('inspections')
      .insert({ job_id: jobId, type, ...payload })
      .select()
      .single();
    if (error) throw error;
    return data as Inspection;
  }
}

export async function submitInspection(
  jobId: string,
  type: InspectionType,
  inspectionPayload: Partial<Inspection>,
  damageItems: Array<Omit<DamageItem, 'id' | 'inspection_id' | 'created_at'>>,
): Promise<void> {
  const inspection = await upsertInspection(jobId, type, {
    ...inspectionPayload,
    inspected_at: new Date().toISOString(),
    has_damage: damageItems.length > 0,
  });

  await supabase.from('damage_items').delete().eq('inspection_id', inspection.id);
  if (damageItems.length > 0) {
    const items = damageItems.map((d) => ({ ...d, inspection_id: inspection.id }));
    const { error } = await supabase.from('damage_items').insert(items);
    if (error) throw error;
  }

  const job = await getJob(jobId);
  const fromStatus = job.status;
  let toStatus: JobStatusValue | string = job.status;

  if (type === 'pickup') {
    toStatus = JOB_STATUS.PICKUP_COMPLETE;
    await updateJob(jobId, { has_pickup_inspection: true, status: toStatus } as Partial<Job>);
  } else {
    toStatus = job.has_pickup_inspection ? JOB_STATUS.POD_READY : JOB_STATUS.DELIVERY_COMPLETE;
    await updateJob(jobId, {
      has_delivery_inspection: true,
      status: toStatus,
      completed_at: new Date().toISOString(),
    } as Partial<Job>);
  }

  await logJobActivity(jobId, `${type}_inspection_submitted`, fromStatus, toStatus);

  // Log to client_logs
  void logClientEvent("inspection_submitted", "info", {
    jobId,
    context: { inspectionType: type, newStatus: toStatus },
  });

  // Auto-sync to Google Sheet if feature flag is enabled
  if (await isFeatureEnabled("AUTO_SHEET_SYNC_ON_JOB_UPDATE")) {
    void syncJobToSheetIfEnabled(jobId);
  }
}

// ─── Photos ──────────────────────────────────────────────────────────

export async function insertPhoto(payload: Omit<Photo, 'id' | 'created_at'>): Promise<Photo> {
  const { data, error } = await supabase.from('photos').insert(payload).select().single();
  if (error) throw error;
  return data as Photo;
}

// ─── Activity Log ────────────────────────────────────────────────────

export async function logJobActivity(
  jobId: string,
  action: string,
  fromStatus?: string,
  toStatus?: string,
  notes?: string,
): Promise<void> {
  await supabase.from('job_activity_log').insert({
    job_id: jobId,
    action,
    from_status: fromStatus ?? null,
    to_status: toStatus ?? null,
    notes: notes ?? null,
  });
}

// ─── Dashboard Counts ────────────────────────────────────────────────

export async function getDashboardCounts(): Promise<{
  activeJobs: number;
  completedLast14Days: number;
  pending: number;
}> {
  const [active, completed, pending] = await Promise.all([
    listActiveJobs(),
    listCompletedJobs(),
    listPendingJobs(),
  ]);
  return {
    activeJobs: active.length,
    completedLast14Days: completed.length,
    pending: pending.length,
  };
}
