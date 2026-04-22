import type { StorageService, StoredFileInfo } from './types';
import { supabase } from '@/integrations/supabase/client';

/**
 * Google Cloud Storage service.
 * Uploads files via the gcs-upload edge function which authenticates
 * with a Google service account.
 */
class GcsStorageService implements StorageService {
  async uploadImage(file: File, pathHint: string): Promise<StoredFileInfo> {
    // Reject files over 10MB to avoid edge function memory issues
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new Error('Upload failed: File too large (max 10 MB)');
    }

    if (file.size === 0) {
      throw new Error('Upload failed: File is empty');
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${pathHint}.${ext}`;

    // Convert file to base64
    const base64 = await this.fileToBase64(file);
    if (!base64) {
      throw new Error('Upload failed: Could not read file contents');
    }

    // Explicitly forward the user's access token. supabase.functions.invoke
    // does not always attach it when the function is deployed with
    // verify_jwt = false, but the function itself calls auth.getUser() and
    // requires it.
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('Upload failed: Authentication expired');
    }

    const { data, error } = await supabase.functions.invoke('gcs-upload', {
      body: {
        fileName,
        contentType: file.type || 'image/jpeg',
        fileBase64: base64,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) {
      throw new Error(classifyUploadError(error.message));
    }
    if (data?.error) {
      throw new Error(classifyUploadError(data.error));
    }

    return {
      url: data.url,
      backend: 'googleCloud' as any,
      backendRef: data.backendRef,
    };
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('File read error'));
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Strip the data URL prefix to get raw base64
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
  }
}

/** Map raw error messages to user-friendly descriptions */
function classifyUploadError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('permission') || lower.includes('403') || lower.includes('forbidden')) {
    return 'Upload failed: Server did not accept the file (permission denied)';
  }
  if (lower.includes('not found') || lower.includes('404')) {
    return 'Upload failed: Storage bucket not found';
  }
  if (lower.includes('too large') || lower.includes('413') || lower.includes('payload')) {
    return 'Upload failed: File too large';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return 'Upload failed: Network unavailable';
  }
  if (lower.includes('token') || lower.includes('auth') || lower.includes('401') || lower.includes('jwt')) {
    return 'Upload failed: Authentication expired';
  }
  return `Upload failed: ${raw}`;
}

export const gcsStorageService = new GcsStorageService();
