/**
 * Test credentials for the dev-only quick-fill button on /login.
 *
 * SECURITY:
 *   - This module is only imported when `import.meta.env.DEV` is true.
 *   - The quick-fill button is also gated by `import.meta.env.DEV`.
 *   - Production builds tree-shake DEV branches, so these values do NOT
 *     ship to prod. Still, only put a low-privilege test account here —
 *     never a real super-admin.
 *
 * To use:
 *   1. Replace the empty strings below with a test account's credentials.
 *   2. In dev, a "Fill test credentials" button appears below the login form.
 *   3. Click it, then click Sign in.
 */

export const TEST_CREDENTIALS = {
  email: "",
  password: "",
} as const;

export const hasTestCredentials = (): boolean =>
  TEST_CREDENTIALS.email.length > 0 && TEST_CREDENTIALS.password.length > 0;
