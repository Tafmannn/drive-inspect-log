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
}

export const internalStorageService = new InternalStorageService();
