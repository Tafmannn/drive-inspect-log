// @vitest-environment jsdom
/**
 * The dev-only Admin Home preview harness (src/dev/adminHomePreview.tsx)
 * must keep rendering the real Dashboard from its mock fixtures. The Supabase
 * client is stubbed so nothing here can reach a backend.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "not", "or", "gte", "lt", "gt", "order", "limit", "maybeSingle", "single"]) {
    builder[m] = () => builder;
  }
  builder.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(ok);
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: () => builder,
      channel: () => channel,
      removeChannel: () => undefined,
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      },
    },
  };
});

async function loadHarness(search: string) {
  vi.resetModules();
  vi.stubEnv("VITE_ENABLE_AUTH", "false");
  window.history.replaceState(null, "", `/preview/admin-home.html${search}`);
  document.documentElement.classList.remove("dark");
  document.body.innerHTML = '<div id="root"></div>';
  await import("@/dev/adminHomePreview");
}

describe("Admin Home preview harness", () => {
  beforeEach(() => {
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the busy fixture with its attention banner and queue", async () => {
    await loadHarness("?fixture=busy");
    await waitFor(() => expect(screen.getByText("Needs your attention")).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText("Needs action")).toBeTruthy();
    expect(screen.getAllByText("YD21 KXL").length).toBeGreaterThan(0);
  });

  it("renders the calm fixture as an empty action queue", async () => {
    await loadHarness("?fixture=calm");
    await waitFor(() => expect(screen.getByText("Action queue is empty")).toBeTruthy(), { timeout: 5000 });
  });

  it("applies the dark theme and super-admin role from the URL", async () => {
    await loadHarness("?fixture=busy&theme=dark&role=SUPERADMIN");
    await waitFor(() => expect(screen.getByText("Super Admin console")).toBeTruthy(), { timeout: 5000 });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
