// src/lib/autosave.ts
// Generic autosave/draft system using localStorage for form persistence

const PREFIX = "axentra.draft.";

export function saveDraft<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify({
      data,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // Quota exceeded — silently ignore
  }
}

export function loadDraft<T>(key: string): { data: T; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // Ignore
  }
}

export function hasDraft(key: string): boolean {
  try {
    return localStorage.getItem(`${PREFIX}${key}`) !== null;
  } catch {
    return false;
  }
}

/**
 * Build a draft key for a specific form + entity
 * e.g. draftKey("pickup", jobId) → "pickup:<jobId>"
 */
export function draftKey(formType: string, entityId: string): string {
  return `${formType}:${entityId}`;
}
