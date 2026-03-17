import { supabase } from '@/integrations/supabase/client';
import type { StorageService, StoredFileInfo } from './types';

export interface SignatureResolveResult {
  url: string | null;
  format: string;
  bucket: string | null;
  path: string | null;
  errorCode: 'OK' | 'OBJECT_NOT_FOUND' | 'PERMISSION' | 'MALFORMED_INPUT' | 'UNKNOWN_ERROR';
  errorMessage?: string;
}

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
   * Returns structured result with error code for caller to decide fallback.
   */
  async resolveSignatureUrlStructured(url: string): Promise<SignatureResolveResult> {
    if (!url) {
      return { url: null, format: 'empty', bucket: null, path: null, errorCode: 'MALFORMED_INPUT', errorMessage: 'Empty URL' };
    }

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
      return { url: url, format, bucket, path, errorCode: 'MALFORMED_INPUT', errorMessage: 'Could not extract bucket/path' };
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) {
      const msg = error?.message ?? 'No signed URL returned';
      const errorCode = msg.includes('not found') || msg.includes('Not found')
        ? 'OBJECT_NOT_FOUND' as const
        : msg.includes('permission') || msg.includes('Permission') || msg.includes('403')
          ? 'PERMISSION' as const
          : 'UNKNOWN_ERROR' as const;

      console.error('[SignatureResolve] createSignedUrl failed', {
        format, bucket, path, error: msg, errorCode,
      });
      return { url: null, format, bucket, path, errorCode, errorMessage: msg };
    }

    console.info('[SignatureResolve] OK', { format, bucket, path: path.slice(0, 40) });
    return { url: data.signedUrl, format, bucket, path, errorCode: 'OK' };
  }

  /**
   * Legacy convenience method — returns URL or null.
   */
  async resolveSignatureUrl(url: string): Promise<string | null> {
    const result = await this.resolveSignatureUrlStructured(url);
    return result.url;
  }
}

export const internalStorageService = new InternalStorageService();
