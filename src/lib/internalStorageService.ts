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

    let url: string;
    if (isSignature) {
      // G: Private bucket — use signed URL (7 days expiry)
      const { data: signedData, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signErr || !signedData?.signedUrl) {
        throw new Error(`Failed to create signed URL: ${signErr?.message ?? 'unknown'}`);
      }
      url = signedData.signedUrl;
    } else {
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      url = urlData.publicUrl;
    }

    return {
      url,
      backend: 'internal',
      backendRef: path,
    };
  }
}

export const internalStorageService = new InternalStorageService();
