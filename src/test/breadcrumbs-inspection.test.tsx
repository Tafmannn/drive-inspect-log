import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";

const at = (path: string, pattern: string) => ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path={pattern} element={<>{children}</>} />
    </Routes>
  </MemoryRouter>
);

describe("breadcrumbs", () => {
  it("inspection routes sit under the job, not a non-existent /inspection page", () => {
    const { result } = renderHook(() => useBreadcrumbs(), {
      wrapper: at("/inspection/abc-123/pickup", "/inspection/:jobId/:inspectionType"),
    });
    expect(result.current).toEqual([
      { label: "Dashboard", path: "/" },
      { label: "Jobs", path: "/jobs" },
      { label: "Job", path: "/jobs/abc-123" },
      { label: "Pickup" },
    ]);
    // the old trail repeated "Inspection" twice
    expect(result.current.filter((c) => c.label === "Inspection")).toHaveLength(0);
  });

  it("delivery is labelled delivery", () => {
    const { result } = renderHook(() => useBreadcrumbs(), {
      wrapper: at("/inspection/abc-123/delivery", "/inspection/:jobId/:inspectionType"),
    });
    expect(result.current.at(-1)).toEqual({ label: "Delivery" });
  });

  it("other routes are unchanged", () => {
    const { result } = renderHook(() => useBreadcrumbs(), { wrapper: at("/jobs/abc-123", "/jobs/:jobId") });
    expect(result.current.map((c) => c.label)).toEqual(["Dashboard", "Jobs", "Job"]);
  });
});
