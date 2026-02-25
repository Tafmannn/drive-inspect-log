import type { StorageService, StoredFileInfo } from './types';
import { internalStorageService } from './internalStorageService';

/**
 * Google Drive storage stub.
 * TODO: Implement with Google OAuth / service account + Drive API.
 * Target folder structure: Axentra/DriveInspect/jobs/{jobId}/{type}/
 */
class GoogleDriveStorageService implements StorageService {
  private warned = false;

  async uploadImage(file: File, pathHint: string): Promise<StoredFileInfo> {
    // TODO: Check for Google Drive credentials in env
    // TODO: Authenticate with Google Workspace
    // TODO: Upload to Google Drive folder
    // TODO: Return Drive file URL and backendRef

    if (!this.warned) {
      console.warn(
        '[GoogleDriveStorageService] Google Drive credentials not configured. Falling back to internal storage.'
      );
      this.warned = true;
    }

    // Fallback to internal storage
    return internalStorageService.uploadImage(file, pathHint);
  }
}

export const googleDriveStorageService = new GoogleDriveStorageService();
