import { describe, it, expect } from "vitest";
import { assessAddressValidation } from "../../supabase/functions/_shared/addressVerdict";

const INPUT = { line1: "10 Downing Street", line2: "", city: "London", postcode: "SW1A 2AA" };

function response(over: { verdict?: object; address?: object } = {}) {
  return {
    result: {
      verdict: { addressComplete: true, ...(over.verdict ?? {}) },
      address: {
        postalAddress: {
          addressLines: ["10 Downing Street"],
          locality: "London",
          postalCode: "SW1A 2AA",
        },
        ...(over.address ?? {}),
      },
    },
  };
}

describe("assessAddressValidation", () => {
  it("confirms an address that matches what was typed", () => {
    expect(assessAddressValidation(response(), INPUT)).toMatchObject({ status: "ok" });
  });

  it("ignores case and punctuation when deciding if Google changed it", () => {
    const r = assessAddressValidation(
      response({ address: { postalAddress: { addressLines: ["10 DOWNING STREET."], locality: "london", postalCode: "SW1A2AA" } } }),
      INPUT,
    );
    expect(r.status).toBe("ok");
  });

  it("reports a correction when Google writes it differently", () => {
    const r = assessAddressValidation(
      response({ address: { postalAddress: { addressLines: ["10 Downing Street"], locality: "London", postalCode: "SW1A 2AB" } } }),
      INPUT,
    );
    expect(r.status).toBe("corrected");
    expect(r.suggested?.postcode).toBe("SW1A 2AB");
  });

  it("warns when the house number is missing", () => {
    const r = assessAddressValidation(
      response({ address: { missingComponentTypes: ["street_number"], postalAddress: { addressLines: ["Downing Street"], locality: "London", postalCode: "SW1A 2AA" } } }),
      { ...INPUT, line1: "Downing Street" },
    );
    expect(r.status).toBe("incomplete");
    expect(r.missing).toEqual(["house or building number"]);
    expect(r.message).toContain("house or building number");
  });

  it("treats an absent addressComplete as incomplete (false booleans are omitted from the JSON)", () => {
    const r = assessAddressValidation(
      { result: { verdict: {}, address: { postalAddress: { addressLines: ["Somewhere"], postalCode: "AB1 2CD" } } } },
      INPUT,
    );
    expect(r.status).toBe("incomplete");
  });

  it("warns on unconfirmed components", () => {
    const r = assessAddressValidation(
      response({ verdict: { hasUnconfirmedComponents: true }, address: { unconfirmedComponentTypes: ["route"] } }),
      INPUT,
    );
    expect(r.status).toBe("unconfirmed");
    expect(r.message).toContain("street name");
  });

  it("is unavailable when there is no usable result (never claims the address is fine)", () => {
    for (const bad of [null, {}, { result: {} }, { result: { verdict: {} } }, "x"]) {
      expect(assessAddressValidation(bad, INPUT).status).toBe("unavailable");
    }
  });
});
