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
  async resolveSignatureUrlStructured(rawInput: string): Promise<SignatureResolveResult> {
    const input = typeof rawInput === 'string' ? rawInput.trim() : '';

    console.info('[SignatureResolve] start', {
      rawInput: rawInput?.slice(0, 140) ?? null,
      normalizedInput: input.slice(0, 140),
    });

    if (!input) {
      console.error('[SignatureResolve] malformed input: empty');
      return {
        url: null,
        format: 'empty',
        bucket: null,
        path: null,
        errorCode: 'MALFORMED_INPUT',
        errorMessage: 'Empty URL',
      };
    }

    let bucket: string | null = null;
    let path: string | null = null;
    let format = 'unknown';

    // Canonical scheme: supabase-sig://bucket/path
    const sigMatch = input.match(/^supabase-sig:\/\/([^/]+)\/(.+)$/);
    if (sigMatch) {
      format = 'supabase-sig';
      [, bucket, path] = sigMatch;
    }

    // Legacy Supabase URL formats
    if (!path && input.includes('/vehicle-signatures/')) {
      const publicMatch = input.match(/\/object\/public\/vehicle-signatures\/(.+?)(?:\?|$)/);
      const signedMatch = input.match(/\/object\/sign\/vehicle-signatures\/(.+?)\?/);
      const extractedPath = publicMatch?.[1] ?? signedMatch?.[1];
      if (extractedPath) {
        format = publicMatch ? 'legacy-public-url' : 'legacy-signed-url';
        bucket = 'vehicle-signatures';
        path = decodeURIComponent(extractedPath);
      }
    }

    // Bare storage path, eg jobs/<jobId>/signatures/...
    if (
      !path &&
      !input.startsWith('http://') &&
      !input.startsWith('https://') &&
      !input.startsWith('data:') &&
      !input.startsWith('blob:')
    ) {
      format = 'bare-path';
      bucket = 'vehicle-signatures';
      path = input;
    }

    console.info('[SignatureResolve] normalized', {
      format,
      bucket,
      path: path?.slice(0, 160) ?? null,
    });

    if (!bucket || !path) {
      const msg = 'Could not extract bucket/path';
      console.error('[SignatureResolve] malformed input', { input: input.slice(0, 160), format });
      return {
        url: null,
        format,
        bucket,
        path,
        errorCode: 'MALFORMED_INPUT',
        errorMessage: msg,
      };
    }

    const expiresInSeconds = 60 * 60;
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    console.info('[SignatureResolve] createSignedUrl result', {
      format,
      bucket,
      path: path.slice(0, 160),
      expiresInSeconds,
      signedUrl: data?.signedUrl?.slice(0, 180) ?? null,
      error: error
        ? {
            message: error.message,
            statusCode: (error as { statusCode?: string | number }).statusCode ?? null,
            name: (error as { name?: string }).name ?? null,
          }
        : null,
    });

    if (error || !data?.signedUrl) {
      const msg = error?.message ?? 'No signed URL returned';
      const lower = msg.toLowerCase();
      const statusCode = String((error as { statusCode?: string | number }).statusCode ?? '');
      const errorCode =
        lower.includes('not found') || lower.includes('resource not found') || statusCode === '404'
          ? 'OBJECT_NOT_FOUND' as const
        : lower.includes('permission') || lower.includes('forbidden') || lower.includes('403') || statusCode === '403'
          ? 'PERMISSION' as const
          : 'UNKNOWN_ERROR' as const;

      return { url: null, format, bucket, path, errorCode, errorMessage: msg };
    }

    return { url: data.signedUrl, format, bucket, path, errorCode: 'OK' };
  }

  /**
   * Legacy convenience method — returns URL or null.
   */
  async resolveSignatureUrl(url: string): Promise<string | null> {
    const result = await this.resolveSignatureUrlStructured(url);
    if (!result.url) {
      console.error('[SignatureResolve] null return', {
        errorCode: result.errorCode,
        errorMessage: result.errorMessage ?? null,
        format: result.format,
        bucket: result.bucket,
        path: result.path?.slice(0, 160) ?? null,
      });
    }
    return result.url;
  }
}

export const internalStorageService = new InternalStorageService();
