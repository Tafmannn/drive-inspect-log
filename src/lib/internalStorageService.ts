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
   * Handles: supabase-sig://, legacy Supabase URLs, bare storage paths.
   */
  async resolveSignatureUrl(url: string): Promise<string | null> {
    if (!url) return null;

    let bucket: string | null = null;
    let path: string | null = null;
    let format = 'unknown';

    // New scheme: supabase-sig://bucket/path
    const sigMatch = url.match(/^supabase-sig:\/\/([^/]+)\/(.+)$/);
    if (sigMatch) {
      format = 'supabase-sig';
      [, bucket, path] = sigMatch;
    }

    // Legacy: Supabase public URL
    if (!path && url.includes('/vehicle-signatures/')) {
      const publicMatch = url.match(/\/object\/public\/vehicle-signatures\/(.+?)(?:\?|$)/);
      const signedMatch = url.match(/\/object\/sign\/vehicle-signatures\/(.+?)\?/);
      const extractedPath = publicMatch?.[1] ?? signedMatch?.[1];
      if (extractedPath) {
        format = publicMatch ? 'legacy-public-url' : 'legacy-signed-url';
        bucket = 'vehicle-signatures';
        path = decodeURIComponent(extractedPath);
      }
    }

    // Bare storage path (no http/data prefix)
    if (!path && !url.startsWith('http') && !url.startsWith('data:')) {
      format = 'bare-path';
      bucket = 'vehicle-signatures';
      path = url;
    }

    if (!bucket || !path) {
      console.warn('[SignatureResolve] Could not extract bucket/path', { url, format });
      return url; // return as-is
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) {
      console.error('[SignatureResolve] createSignedUrl failed', {
        format, bucket, path,
        error: error?.message,
      });
      return null;
    }

    return data.signedUrl;
  }
}

export const internalStorageService = new InternalStorageService();
