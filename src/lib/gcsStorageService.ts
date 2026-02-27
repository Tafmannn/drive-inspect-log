import type { StorageService, StoredFileInfo } from './types';
import { supabase } from '@/integrations/supabase/client';

/**
 * Google Cloud Storage service.
 * Uploads files via the gcs-upload edge function which authenticates
 * with a Google service account.
 */
class GcsStorageService implements StorageService {
  async uploadImage(file: File, pathHint: string): Promise<StoredFileInfo> {
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${pathHint}.${ext}`;

    // Convert file to base64
    const base64 = await this.fileToBase64(file);

    const { data, error } = await supabase.functions.invoke('gcs-upload', {
      body: {
        fileName,
        contentType: file.type || 'image/jpeg',
        fileBase64: base64,
      },
    });

    if (error) throw new Error(`GCS upload failed: ${error.message}`);
    if (data?.error) throw new Error(`GCS upload failed: ${data.error}`);

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

export const gcsStorageService = new GcsStorageService();
