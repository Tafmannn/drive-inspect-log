import type { StorageBackend, StorageService } from './types';
import { internalStorageService } from './internalStorageService';
import { gcsStorageService } from './gcsStorageService';
import { isFeatureEnabled } from './featureFlags';

// Default to internal; dynamically resolved at runtime
let resolvedService: StorageService | null = null;
let resolvePromise: Promise<void> | null = null;

async function resolveStorage(): Promise<StorageService> {
  if (resolvedService) return resolvedService;
  if (!resolvePromise) {
    resolvePromise = isFeatureEnabled('CLOUD_STORAGE_ENABLED').then((gcs) => {
      resolvedService = gcs ? gcsStorageService : internalStorageService;
    });
  }
  await resolvePromise;
  return resolvedService!;
}

/**
 * Proxy storage service that resolves at runtime based on the
 * CLOUD_STORAGE_ENABLED feature flag. Falls back to Supabase internal storage.
 */
export const storageService: StorageService = {
  async uploadImage(file, pathHint) {
    const svc = await resolveStorage();
    return svc.uploadImage(file, pathHint);
  },
};
