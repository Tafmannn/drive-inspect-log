import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { guessExtension, receiptFileStem } from "@/features/invoicing/api/receiptExport";
import { receiptCaption, receiptFileRef } from "@/features/invoicing/api/invoiceDocument";
import { fitWithin } from "@/features/invoicing/api/receiptImages";

describe("receipt file naming", () => {
  const line = { ref: "R03", category: "Congestion/ULEZ/CAZ", amount_gross: 12.5, expense_date: "2026-11-06" };

  it("labels extra files for the same expense R03b, R03c ...", () => {
    expect(receiptFileRef("R03", 0)).toBe("R03");
    expect(receiptFileRef("R03", 1)).toBe("R03b");
    expect(receiptFileRef("R03", 2)).toBe("R03c");
  });

  it("names files after the receipt ref, job, category and amount, filesystem-safe", () => {
    expect(receiptFileStem(line, "AX1046", 0)).toBe("R03_AX1046_Congestion-ULEZ-CAZ_12.50");
    expect(receiptFileStem(line, "", 1)).toBe("R03b_Congestion-ULEZ-CAZ_12.50");
    expect(receiptFileStem({ ...line, category: "Car Wash / Valet" }, "JOB 9/A", 0)).toBe("R03_JOB-9-A_Car-Wash-Valet_12.50");
  });

  it("captions a receipt with its job, category, date and amount paid", () => {
    expect(receiptCaption(line, "AX1046")).toBe("AX1046  |  Congestion/ULEZ/CAZ  |  06/11/2026  |  £12.50");
    expect(receiptCaption(line, "")).toBe("Congestion/ULEZ/CAZ  |  06/11/2026  |  £12.50");
  });

  it("prefers the downloaded file's type over the URL when choosing an extension", () => {
    expect(guessExtension("https://x/receipt.jpg?token=abc.png", "image/png")).toBe(".png");
    expect(guessExtension("https://x/abc/receipt.PDF?token=1")).toBe(".pdf");
    expect(guessExtension("https://x/path.with.png.in/it")).toBe(".jpg");
    expect(guessExtension("", "image/webp")).toBe(".webp");
  });
});

describe("fitWithin", () => {
  it("shrinks to the longest side and never upscales", () => {
    expect(fitWithin(4000, 3000, 1400)).toEqual({ w: 1400, h: 1050 });
    expect(fitWithin(3000, 4000, 1400)).toEqual({ w: 1050, h: 1400 });
    expect(fitWithin(800, 600, 1400)).toEqual({ w: 800, h: 600 });
    expect(fitWithin(300, 6000, 1400)).toEqual({ w: 70, h: 1400 });
    expect(fitWithin(0, 100, 1400)).toEqual({ w: 0, h: 0 });
  });
});
