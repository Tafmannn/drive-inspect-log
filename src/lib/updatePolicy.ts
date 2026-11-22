/**
 * Routes where applying an update (a full reload) could discard work the
 * user has not saved yet. The banner stays hidden there and reappears on the
 * next screen. Evidence itself is safe across a reload (pending uploads live
 * in IndexedDB), but form state is not.
 */
const HOLD_ROUTES: RegExp[] = [
  /^\/inspection(\/|$)/,
  /^\/jobs\/new$/,
  /^\/jobs\/[^/]+\/edit$/,
  /^\/expenses\/new$/,
  /^\/expenses\/[^/]+\/edit$/,
  /^\/invoice\/new$/,
];

export function isUpdateHeldOn(pathname: string): boolean {
  return HOLD_ROUTES.some((r) => r.test(pathname));
}
