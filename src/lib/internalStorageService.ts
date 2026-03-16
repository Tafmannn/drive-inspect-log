import { supabase } from '@/integrations/supabase/client';
import type { StorageService, StoredFileInfo } from './types';

class InternalStorageService implements StorageService {
  async uploadImage(file: File, pathHint: string): Promise<StoredFileInfo> {
    const isSignature = pathHint.includes('signature');
    const bucket = isSignature ? 'vehicle-signatures' : 'vehicle-photos';
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${pathHint}.${ext}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    if (isSignature) {
      // G: Private bucket — store the *path* as the URL, not a signed URL.
      // Signed URLs expire; the path is permanent and can be re-signed at read time.
      // We prefix with a sentinel so resolvers know to create a signed URL on demand.
      return {
        url: `supabase-sig://${bucket}/${path}`,
        backend: 'internal',
        backendRef: path,
      };
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return {
      url: urlData.publicUrl,
      backend: 'internal',
      backendRef: path,
    };
  }

  /**
   * Resolve a signature URL to a fresh signed URL.
   * Handles both the new `supabase-sig://` scheme and legacy signed URLs.
   */
  async resolveSignatureUrl(url: string): Promise<string | null> {
    if (!url) return null;

    // New scheme: supabase-sig://bucket/path
    const sigMatch = url.match(/^supabase-sig:\/\/([^/]+)\/(.+)$/);
    if (sigMatch) {
      const [, bucket, path] = sigMatch;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60); // 1 hour, fresh each time
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    }

    // Legacy: already a full URL (possibly expired signed URL)
    // Try to extract path from Supabase signed URL and re-sign
    if (url.includes('/vehicle-signatures/') && url.includes('token=')) {
      const pathMatch = url.match(/\/object\/sign\/vehicle-signatures\/(.+?)\?/);
      if (pathMatch) {
        const path = decodeURIComponent(pathMatch[1]);
        const { data, error } = await supabase.storage
          .from('vehicle-signatures')
          .createSignedUrl(path, 60 * 60);
        if (!error && data?.signedUrl) return data.signedUrl;
      }
    }

    // If it's a backendRef path stored directly
    if (!url.startsWith('http') && !url.startsWith('data:')) {
      const { data, error } = await supabase.storage
        .from('vehicle-signatures')
        .createSignedUrl(url, 60 * 60);
      if (!error && data?.signedUrl) return data.signedUrl;
    }

    return url; // return as-is if we can't re-sign
  }
}

export const internalStorageService = new InternalStorageService();

export const internalStorageService = new InternalStorageService();
