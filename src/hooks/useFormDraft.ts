// src/hooks/useFormDraft.ts
// Reusable localStorage-based form draft hook for inspection forms.

import { useEffect, useState } from "react";

const DRAFT_STORAGE_KEY = "axentra.inspectionDrafts.v1";

type DraftShape = Record<string, unknown>;

function loadDraft(key: string): DraftShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all[key] ?? null;
  } catch {
    return null;
  }
}

function saveDraftToStorage(key: string, draft: DraftShape) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[key] = draft;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // best-effort
  }
}

function clearDraftFromStorage(key: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    delete all[key];
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function useFormDraft<T extends DraftShape>(
  key: string,
  initialValues: T,
) {
  const [values, setValues] = useState<T>(() => {
    const draft = loadDraft(key);
    return (draft as T) ?? initialValues;
  });

  useEffect(() => {
    const timer = setTimeout(() => saveDraftToStorage(key, values), 400);
    return () => clearTimeout(timer);
  }, [key, values]);

  const update = (patch: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  };

  const reset = () => {
    setValues(initialValues);
    clearDraftFromStorage(key);
  };

  const clear = () => clearDraftFromStorage(key);

  return { values, setValues, update, reset, clear };
}
