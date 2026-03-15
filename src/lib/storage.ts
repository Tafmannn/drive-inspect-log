import type { StorageService, StoredFileInfo } from './types';
import { internalStorageService } from './internalStorageService';
import { gcsStorageService } from './gcsStorageService';
import { isFeatureEnabled } from './featureFlags';
import { logClientEvent } from './logger';

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
 * CLOUD_STORAGE_ENABLED feature flag. Falls back to Supabase internal storage
 * if GCS upload fails (e.g. permission errors, network issues).
 */
export const storageService: StorageService = {
  async uploadImage(file, pathHint) {
    const svc = await resolveStorage();

    // If primary is GCS, try it first but fall back to internal on failure
    if (svc === gcsStorageService) {
      try {
        return await svc.uploadImage(file, pathHint);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Storage] GCS upload failed, falling back to internal storage: ${msg}`);
        void logClientEvent('gcs_fallback_to_internal', 'warn', {
          message: msg,
          source: 'storage',
          type: 'upload',
          context: { pathHint: pathHint },
        });
        return await internalStorageService.uploadImage(file, pathHint);
      }
    }

    return svc.uploadImage(file, pathHint);
  },
};
