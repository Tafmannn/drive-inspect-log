import { describe, it, expect } from "vitest";
import {
  decidePodRecipient,
  isOwnSignedStorageUrl,
  renderPodEmail,
  resolveEmailLogoUrl,
  resolveLogoUrl,
  type PodEmailInput,
} from "../../supabase/functions/_shared/podEmail";

const SB = "https://lynkvfduzqdyvlzgriyh.supabase.co";
const POD = `${SB}/storage/v1/object/sign/pod-pdfs/org/AXENTRA_POD_AX0070.pdf?token=abc`;
const ZIP = `${SB}/storage/v1/object/sign/pod-photos/org/AXENTRA_POD_AX0070_photos.zip?token=def`;

const base: PodEmailInput = {
  operator: {
    name: "Axentra Vehicles",
    logoUrl: "https://app.axentra.test/email/axentra-logo-email.jpg",
    primaryColour: "#0052CC",
    contactEmail: "ops@axentra.test",
    contactPhone: "07577 791633",
    address: "1 Example Way, Leeds",
  },
  recipientName: "Sam Jones",
  job: { ref: "AX0070", reg: "yd66 owp", make: "Ford", model: "Focus", from: "Leeds LS1", to: "Knottingley WF11" },
  deliveredAt: "2026-11-16T17:44:48Z",
  receivedBy: "Sam Jones",
  podUrl: POD,
  photosUrl: ZIP,
};

describe("renderPodEmail", () => {
  it("is branded and complete", () => {
    const e = renderPodEmail(base);
    expect(e.subject).toBe("Proof of Delivery – YD66 OWP (AX0070)");
    expect(e.html).toContain('src="https://app.axentra.test/email/axentra-logo-email.jpg"');
    expect(e.html).toContain("background:#2B7DC9");
    expect(e.html).toContain("YD66 OWP has been delivered");
    expect(e.html).toContain("Hello Sam Jones,");
    expect(e.html).toContain("YD66 OWP · Ford Focus");
    expect(e.html).toContain("Leeds LS1");
    expect(e.html).toContain("Knottingley WF11");
    expect(e.html).toContain("Received by");
    expect(e.html).toContain("16 Nov 2026");
    expect(e.html).toContain("17:44");
    expect(e.html).toContain("Download Proof of Delivery (PDF)");
    expect(e.html).toContain("Download vehicle photos (ZIP)");
    expect(e.html).toContain("call 07577 791633 or reply to this email");
    expect(e.html).toContain("1 Example Way, Leeds");
  });

  it("hides the long signed links behind buttons in HTML, keeps them in plain text", () => {
    const e = renderPodEmail(base);
    // Link only appears as an href, never as visible text.
    const visible = e.html.replace(/href="[^"]*"/g, "");
    expect(visible).not.toContain("token=abc");
    expect(e.text).toContain(POD);
    expect(e.text).toContain(ZIP);
  });

  it("falls back to a text header and sensible defaults", () => {
    const e = renderPodEmail({
      ...base,
      operator: { name: "", logoUrl: "http://insecure.test/logo.png", primaryColour: "blue" },
      recipientName: "",
      job: { ref: "", reg: "" },
      deliveredAt: null,
      receivedBy: null,
      photosUrl: null,
    });
    expect(e.subject).toBe("Proof of Delivery – Your vehicle");
    expect(e.html).not.toContain("insecure.test");
    expect(e.html).toContain("Your vehicle logistics provider");
    expect(e.html).toContain("Hello,");
    expect(e.html).toContain("#172F52");
    expect(e.html).not.toContain("Download vehicle photos");
    expect(e.html).not.toContain("Received by");
  });

  it("escapes everything interpolated", () => {
    const e = renderPodEmail({ ...base, recipientName: '<img src=x onerror=alert(1)>', job: { ...base.job, ref: "<b>1</b>" } });
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).not.toContain("<b>1</b>");
  });
});

describe("resolveLogoUrl", () => {
  it("accepts https or an app-relative path", () => {
    expect(resolveLogoUrl("https://cdn.test/l.png", null)).toBe("https://cdn.test/l.png");
    expect(resolveLogoUrl("/email/logo.jpg", "https://app.test")).toBe("https://app.test/email/logo.jpg");
    expect(resolveLogoUrl("/email/logo.jpg", "https://app.test/")).toBe("https://app.test/email/logo.jpg");
  });
  it("rejects everything else", () => {
    expect(resolveLogoUrl("", "https://app.test")).toBeNull();
    expect(resolveLogoUrl("/email/logo.jpg", null)).toBeNull();
    expect(resolveLogoUrl("//evil.test/x.png", "https://app.test")).toBeNull();
    expect(resolveLogoUrl("http://plain.test/x.png", "https://app.test")).toBeNull();
    expect(resolveLogoUrl("javascript:alert(1)", "https://app.test")).toBeNull();
  });
});

describe("isOwnSignedStorageUrl", () => {
  it("accepts this project's signed URL in the right bucket", () => {
    expect(isOwnSignedStorageUrl(POD, SB, "pod-pdfs")).toBe(true);
    expect(isOwnSignedStorageUrl(ZIP, SB, "pod-photos")).toBe(true);
  });
  it("rejects other hosts, buckets, unsigned or non-URLs", () => {
    expect(isOwnSignedStorageUrl(POD, SB, "pod-photos")).toBe(false);
    expect(isOwnSignedStorageUrl(POD.replace("lynkvfduzqdyvlzgriyh", "attacker"), SB, "pod-pdfs")).toBe(false);
    expect(isOwnSignedStorageUrl("https://evil.test/storage/v1/object/sign/pod-pdfs/x?token=1", SB, "pod-pdfs")).toBe(false);
    expect(isOwnSignedStorageUrl(`${SB}/storage/v1/object/public/pod-pdfs/x.pdf`, SB, "pod-pdfs")).toBe(false);
    expect(isOwnSignedStorageUrl(`${SB}/storage/v1/object/sign/pod-pdfs/x.pdf`, SB, "pod-pdfs")).toBe(false);
    expect(isOwnSignedStorageUrl(POD.replace("https", "http"), SB, "pod-pdfs")).toBe(false);
    expect(isOwnSignedStorageUrl(42, SB, "pod-pdfs")).toBe(false);
  });
});

describe("decidePodRecipient", () => {
  it("lets admins send anywhere, saving to the job only when it has no email", () => {
    expect(decidePodRecipient({ isAdmin: true, to: "a@x.test", jobEmails: [], clientEmails: [] })).toEqual({ allowed: true, saveToJob: true });
    expect(decidePodRecipient({ isAdmin: true, to: "a@x.test", jobEmails: ["b@x.test"], clientEmails: [] })).toEqual({ allowed: true, saveToJob: false });
  });

  it("lets a driver use a job or client email on file (case-insensitive)", () => {
    expect(decidePodRecipient({ isAdmin: false, to: "Ops@Client.test", jobEmails: [null, ""], clientEmails: ["ops@client.test"] })).toEqual({ allowed: true, saveToJob: true });
    expect(decidePodRecipient({ isAdmin: false, to: "d@x.test", jobEmails: ["d@x.test"], clientEmails: [] })).toEqual({ allowed: true, saveToJob: false });
  });

  it("lets a driver enter an address when nothing is on file, and saves it", () => {
    expect(decidePodRecipient({ isAdmin: false, to: "new@x.test", jobEmails: [null, ""], clientEmails: [null] })).toEqual({ allowed: true, saveToJob: true });
  });

  it("stops a driver redirecting away from an address on file", () => {
    expect(decidePodRecipient({ isAdmin: false, to: "other@x.test", jobEmails: ["d@x.test"], clientEmails: ["c@x.test"] })).toEqual({
      allowed: false,
      onFile: ["d@x.test", "c@x.test"],
    });
  });
});

describe("renderPodEmail — Proof of Collection", () => {
  it("is worded for a collection and links the collection PDF", () => {
    const e = renderPodEmail({ ...base, kind: "collection", receivedBy: "Sam", photosUrl: null });
    expect(e.subject).toBe("Proof of Collection – YD66 OWP (AX0070)");
    expect(e.html).toContain("YD66 OWP has been collected");
    expect(e.html).toContain("Download Proof of Collection (PDF)");
    expect(e.html).toContain("Released by");
    expect(e.html).toContain("Going to");
    expect(e.html).not.toContain("Proof of Delivery");
    expect(e.text).toContain("PROOF OF COLLECTION — YD66 OWP has been collected");
  });

  it("the delivery email is unchanged by default", () => {
    const e = renderPodEmail(base);
    expect(e.subject).toBe("Proof of Delivery – YD66 OWP (AX0070)");
    expect(e.html).toContain("Received by");
  });
});

describe("POD/POC email banner", () => {
  it("is very dark navy (not the old black) with the brand accent under it", () => {
    for (const kind of ["delivery", "collection"] as const) {
      const e = renderPodEmail({ ...base, kind });
      expect(e.html).toContain('bgcolor="#FFFFFF"');
      expect(e.html).toContain("#F4F7FA");
      expect(e.html).not.toContain("#060606");
      expect(e.html).toContain("background:#2B7DC9");
    }
  });

  it("falls back to a letter-spaced wordmark when there is no logo", () => {
    const e = renderPodEmail({ ...base, operator: { ...base.operator, logoUrl: null } });
    expect(e.html).toContain("AXENTRA VEHICLES");
  });
});

describe("resolveEmailLogoUrl", () => {
  const app = "https://app.axentra.test";
  it("uses the transparent navy-friendly logo for the stored default (black-background) one", () => {
    expect(resolveEmailLogoUrl("/email/axentra-logo-email.jpg", app)).toBe(`${app}/email/axentra-logo-email-dark.png`);
    expect(resolveEmailLogoUrl(null, app)).toBe(`${app}/email/axentra-logo-email-dark.png`);
    expect(resolveEmailLogoUrl("  ", app)).toBe(`${app}/email/axentra-logo-email-dark.png`);
  });
  it("leaves a different organisation logo alone", () => {
    expect(resolveEmailLogoUrl("https://cdn.example.com/own-logo.png", app)).toBe("https://cdn.example.com/own-logo.png");
  });
  it("is null when the app address is unknown (no broken relative link)", () => {
    expect(resolveEmailLogoUrl("/email/axentra-logo-email.jpg", null)).toBeNull();
  });
});
