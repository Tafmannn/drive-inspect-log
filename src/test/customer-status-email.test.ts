import { describe, it, expect } from "vitest";
import {
  cleanRecipients,
  formatUkDateTime,
  renderStatusEmail,
  safeColour,
  safeHttpsUrl,
  safePortalUrl,
  skipReasonFor,
  type StatusEmailInput,
} from "../../supabase/functions/_shared/customerStatusEmail";

const base: StatusEmailInput = {
  event: "collected",
  operator: { name: "Axentra", primaryColour: "#0A66C2", logoUrl: null, contactEmail: "ops@axentra.test", contactPhone: "0161 000 0000" },
  clientName: "CJE Transport",
  job: { reg: "ab12 cde", make: "BMW", model: "X5", ref: "AX1234", fromPlace: "Leeds LS1", toPlace: "York YO1" },
  at: "2026-11-11T09:30:00Z",
  portalUrl: "https://app.axentra.test/portal/jobs/123",
};

describe("renderStatusEmail", () => {
  it("collected: subject, content and portal button", () => {
    const e = renderStatusEmail(base);
    expect(e.subject).toBe("Collected: AB12 CDE is on its way");
    expect(e.html).toContain("Your vehicle has been collected");
    expect(e.html).toContain("AB12 CDE (BMW X5)");
    expect(e.html).toContain("Leeds LS1 → York YO1");
    expect(e.html).toContain('href="https://app.axentra.test/portal/jobs/123"');
    expect(e.html).toContain("Track this move");
    expect(e.html).toContain("background:#0A66C2");
    expect(e.text).toContain("Track this move: https://app.axentra.test/portal/jobs/123");
    expect(e.text).toContain("Hello CJE Transport,");
    expect(e.html).not.toContain("Received by");
  });

  it("delivered: subject, received-by and report button", () => {
    const e = renderStatusEmail({ ...base, event: "delivered", receivedBy: "Sam Jones" });
    expect(e.subject).toBe("Delivered: AB12 CDE has arrived");
    expect(e.html).toContain("Your vehicle has been delivered");
    expect(e.html).toContain("Received by");
    expect(e.html).toContain("Sam Jones");
    expect(e.html).toContain("View delivery report and photos");
  });

  it("shows UK local time", () => {
    // 09:30 UTC on 11 Nov is 09:30 GMT; 1 Jul 12:00 UTC is 13:00 BST.
    expect(formatUkDateTime("2026-11-11T09:30:00Z")).toContain("09:30");
    expect(formatUkDateTime("2026-07-01T12:00:00Z")).toContain("13:00");
    expect(formatUkDateTime("not a date")).toBeNull();
    expect(formatUkDateTime(null)).toBeNull();
  });

  it("escapes everything interpolated", () => {
    const e = renderStatusEmail({
      ...base,
      operator: { ...base.operator, name: '<script>alert(1)</script>' },
      clientName: '"><img src=x onerror=alert(1)>',
      job: { ...base.job, ref: "<b>x</b>" },
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).not.toContain("<b>x</b>");
    expect(e.html).toContain("&lt;script&gt;");
  });

  it("drops an unsafe portal link, logo or colour instead of using it", () => {
    const e = renderStatusEmail({
      ...base,
      portalUrl: "javascript:alert(1)",
      operator: { ...base.operator, logoUrl: "http://insecure.test/logo.png", primaryColour: "red;background:url(x)" },
    });
    expect(e.html).not.toContain("javascript:");
    expect(e.html).not.toContain("Track this move");
    expect(e.html).not.toContain("insecure.test");
    expect(e.html).not.toContain("url(x)");
    expect(e.html).toContain("#111827");
  });

  it("uses a https logo when given", () => {
    const e = renderStatusEmail({ ...base, operator: { ...base.operator, logoUrl: "https://cdn.test/logo.png" } });
    expect(e.html).toContain('src="https://cdn.test/logo.png"');
  });

  it("copes with sparse job data", () => {
    const e = renderStatusEmail({
      event: "delivered",
      operator: { name: "" },
      job: { reg: "" },
    });
    expect(e.subject).toBe("Delivered: your vehicle has arrived");
    expect(e.text).toContain("Hello,");
    expect(e.html).not.toContain("Route");
  });
});

describe("helpers", () => {
  it("safeColour accepts only #rrggbb", () => {
    expect(safeColour("#ABCDEF")).toBe("#ABCDEF");
    expect(safeColour("#abc")).toBe("#111827");
    expect(safeColour("blue")).toBe("#111827");
    expect(safeColour(null)).toBe("#111827");
  });

  it("safeHttpsUrl / safePortalUrl", () => {
    expect(safeHttpsUrl("https://x.test/a")).toBe("https://x.test/a");
    expect(safeHttpsUrl("http://x.test/a")).toBeNull();
    expect(safeHttpsUrl("data:image/png;base64,xx")).toBeNull();
    expect(safePortalUrl("http://localhost:5173/portal/jobs/1")).toBe("http://localhost:5173/portal/jobs/1");
    expect(safePortalUrl("http://evil.test/portal")).toBeNull();
    expect(safePortalUrl("not a url")).toBeNull();
  });

  it("cleanRecipients dedupes, lower-cases and drops invalid addresses", () => {
    expect(cleanRecipients(["A@x.test", "a@x.test ", "bad", null, "", "b@y.test"])).toEqual(["a@x.test", "b@y.test"]);
  });

  it("skipReasonFor", () => {
    const job = { status: "pickup_complete", client_id: "c1", is_hidden: false };
    expect(skipReasonFor("collected", job, "c1")).toBeNull();
    expect(skipReasonFor("collected", null, "c1")).toBe("job_missing");
    expect(skipReasonFor("collected", { ...job, is_hidden: true }, "c1")).toBe("job_hidden");
    expect(skipReasonFor("collected", job, "c2")).toBe("client_changed");
    expect(skipReasonFor("collected", { ...job, status: "cancelled" }, "c1")).toBe("job_cancelled");
    expect(skipReasonFor("collected", { ...job, status: "pod_ready" }, "c1")).toBe("superseded_by_delivery");
    expect(skipReasonFor("delivered", { ...job, status: "pod_ready" }, "c1")).toBeNull();
    expect(skipReasonFor("delivered", { ...job, status: "completed" }, "c1")).toBeNull();
  });
});
