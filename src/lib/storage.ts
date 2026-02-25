import type { StorageBackend, StorageService } from './types';
import { internalStorageService } from './internalStorageService';
import { googleDriveStorageService } from './googleDriveStorageService';

export const CURRENT_STORAGE_BACKEND: StorageBackend = 'internal' as StorageBackend;

export const storageService: StorageService =
  CURRENT_STORAGE_BACKEND === 'googleDrive'
    ? googleDriveStorageService
    : internalStorageService;
