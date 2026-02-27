import { supabase } from '@/integrations/supabase/client';
import { isFeatureEnabled } from './featureFlags';

export interface ReceiptOcrResult {
  amount: number | null;
  date: string | null;
  vendor: string | null;
  rawText: string;
}

export interface OdometerOcrResult {
  reading: number | null;
  rawText: string;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('File read error'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
  });
}

export async function ocrReceipt(file: File): Promise<ReceiptOcrResult | null> {
  const enabled = await isFeatureEnabled('VISION_AI_ENABLED');
  if (!enabled) return null;

  const imageBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('vision-ocr', {
    body: { imageBase64, type: 'receipt' },
  });

  if (error || data?.error) {
    console.warn('[Vision AI] Receipt OCR failed:', error?.message || data?.error);
    return null;
  }

  return data as ReceiptOcrResult;
}

export async function ocrOdometer(file: File): Promise<OdometerOcrResult | null> {
  const enabled = await isFeatureEnabled('VISION_AI_ENABLED');
  if (!enabled) return null;

  const imageBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('vision-ocr', {
    body: { imageBase64, type: 'odometer' },
  });

  if (error || data?.error) {
    console.warn('[Vision AI] Odometer OCR failed:', error?.message || data?.error);
    return null;
  }

  return data as OdometerOcrResult;
}
