// src/lib/runtimeMode.ts
// Dependency-free runtime mode helpers. Keep this module free of app-level imports
// so it can be safely consumed by low-level utilities and React components.

export const E2E_TEST_MODE =
  typeof import.meta !== "undefined" &&
  (import.meta.env.VITE_E2E_TEST_MODE as string | undefined) === "true";

/** Check if E2E test mode is active. */
export function isE2ETestMode(): boolean {
  return E2E_TEST_MODE;
}
