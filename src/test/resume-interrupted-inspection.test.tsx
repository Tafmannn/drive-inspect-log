import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import {
  ACTIVE_INSPECTION_MAX_AGE_MS,
  clearActiveInspection,
  markActiveInspection,
  readInterruptedInspection,
} from "@/lib/activeInspection";

const PATH = "/inspection/11111111-2222-4333-8444-555555555555/pickup";

describe("activeInspection marker", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips for the same user while recent", () => {
    markActiveInspection(PATH, "u1", 1_000);
    expect(readInterruptedInspection("u1", 1_000 + 60_000)).toBe(PATH);
  });

  it("ignores another user, a signed-out start, or a stale marker", () => {
    markActiveInspection(PATH, "u1", 1_000);
    expect(readInterruptedInspection("u2", 2_000)).toBeNull();
    expect(readInterruptedInspection(null, 2_000)).toBeNull();
    expect(readInterruptedInspection("u1", 1_000 + ACTIVE_INSPECTION_MAX_AGE_MS + 1)).toBeNull();
  });

  it("only accepts inspection paths", () => {
    markActiveInspection("/jobs/123", "u1");
    expect(readInterruptedInspection("u1")).toBeNull();
    localStorage.setItem("axentra.activeInspection.v1", JSON.stringify({ path: "https://evil.test/x", at: Date.now(), userId: "u1" }));
    expect(readInterruptedInspection("u1")).toBeNull();
    localStorage.setItem("axentra.activeInspection.v1", "not json");
    expect(readInterruptedInspection("u1")).toBeNull();
  });

  it("clears, but a different inspection's exit doesn't clear this one", () => {
    markActiveInspection(PATH, "u1");
    clearActiveInspection("/inspection/other/delivery");
    expect(readInterruptedInspection("u1")).toBe(PATH);
    clearActiveInspection(PATH);
    expect(readInterruptedInspection("u1")).toBeNull();
  });
});

const auth = { authLoading: false, user: { id: "u1" } as { id: string } | null };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));

import { ResumeInterruptedInspection } from "@/components/ResumeInterruptedInspection";

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}|{String((loc.state as { resumeAfterRestart?: boolean } | null)?.resumeAfterRestart ?? false)}</p>;
}

function renderAt(start: string) {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <ResumeInterruptedInspection />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResumeInterruptedInspection", () => {
  beforeEach(() => {
    localStorage.clear();
    auth.authLoading = false;
    auth.user = { id: "u1" };
  });

  it("sends the same driver back to the interrupted inspection", () => {
    markActiveInspection(PATH, "u1");
    renderAt("/");
    expect(screen.getByTestId("where")).toHaveTextContent(`${PATH}|true`);
  });

  it("does nothing without a marker", () => {
    renderAt("/");
    expect(screen.getByTestId("where")).toHaveTextContent("/|false");
  });

  it("does nothing for a different signed-in user", () => {
    markActiveInspection(PATH, "someone-else");
    renderAt("/");
    expect(screen.getByTestId("where")).toHaveTextContent("/|false");
  });

  it("never overrides a page the app was opened on directly", () => {
    markActiveInspection(PATH, "u1");
    renderAt("/jobs");
    expect(screen.getByTestId("where")).toHaveTextContent("/jobs|false");
  });

  it("waits for sign-in to resolve", () => {
    markActiveInspection(PATH, "u1");
    auth.authLoading = true;
    auth.user = null;
    const { rerender } = renderAt("/");
    expect(screen.getByTestId("where")).toHaveTextContent("/|false");
    auth.authLoading = false;
    auth.user = { id: "u1" };
    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <ResumeInterruptedInspection />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("where")).toHaveTextContent(`${PATH}|true`);
  });
});
