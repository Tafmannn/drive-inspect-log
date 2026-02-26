import { get, set, del, keys, values } from 'idb-keyval';
import { storageService } from './storage';
import { insertPhoto } from './api';

export interface PendingUpload {
  id: string;
  jobId: string;
  inspectionType: 'pickup' | 'delivery';
  photoType: string;
  label: string | null;
  fileName: string;
  createdAt: string;
  status: 'pending' | 'uploading' | 'failed' | 'done';
  errorMessage?: string;
}

const PREFIX = 'pending-upload-';
const fileKey = (id: string) => `${PREFIX}file-${id}`;
const metaKey = (id: string) => `${PREFIX}meta-${id}`;

export async function addPendingUpload(
  file: File,
  meta: Omit<PendingUpload, 'status' | 'createdAt' | 'fileName'>
): Promise<PendingUpload> {
  const entry: PendingUpload = {
    ...meta,
    fileName: file.name,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await set(metaKey(meta.id), entry);
  await set(fileKey(meta.id), file);
  return entry;
}

export async function getAllPendingUploads(): Promise<PendingUpload[]> {
  const allKeys = await keys();
  const metaKeys = (allKeys as string[]).filter((k) => k.startsWith(`${PREFIX}meta-`));
  const items: PendingUpload[] = [];
  for (const k of metaKeys) {
    const v = await get<PendingUpload>(k);
    if (v && v.status !== 'done') items.push(v);
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getPendingCountForJob(jobId: string): Promise<number> {
  const all = await getAllPendingUploads();
  return all.filter((u) => u.jobId === jobId && u.status !== 'done').length;
}

export async function retryUpload(id: string): Promise<boolean> {
  const meta = await get<PendingUpload>(metaKey(id));
  const file = await get<File>(fileKey(id));
  if (!meta || !file) return false;

  meta.status = 'uploading';
  await set(metaKey(id), meta);

  try {
    const result = await storageService.uploadImage(
      file,
      `jobs/${meta.jobId}/${meta.inspectionType}/${meta.photoType}/${meta.id}`
    );
    await insertPhoto({
      job_id: meta.jobId,
      inspection_id: null,
      type: meta.photoType,
      url: result.url,
      thumbnail_url: null,
      backend: result.backend,
      backend_ref: result.backendRef ?? null,
      label: meta.label,
    });
    meta.status = 'done';
    await set(metaKey(id), meta);
    await del(fileKey(id));
    return true;
  } catch (e: unknown) {
    meta.status = 'failed';
    meta.errorMessage = e instanceof Error ? e.message : 'Unknown error';
    await set(metaKey(id), meta);
    return false;
  }
}

export async function retryAllPending(): Promise<{ succeeded: number; failed: number }> {
  const all = await getAllPendingUploads();
  let succeeded = 0;
  let failed = 0;
  for (const item of all) {
    if (item.status === 'done') continue;
    const ok = await retryUpload(item.id);
    if (ok) succeeded++;
    else failed++;
  }
  return { succeeded, failed };
}

export async function clearDoneUploads(): Promise<void> {
  const allKeys = await keys();
  const metaKeys = (allKeys as string[]).filter((k) => k.startsWith(`${PREFIX}meta-`));
  for (const k of metaKeys) {
    const v = await get<PendingUpload>(k);
    if (v && v.status === 'done') {
      await del(k);
      await del(fileKey(v.id));
    }
  }
}
