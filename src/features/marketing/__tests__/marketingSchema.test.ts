import { describe, it, expect } from "vitest";
import {
  movementRequestSchema,
  driverApplicationSchema,
  type MovementRequestValues,
  type DriverApplicationValues,
} from "../lib/marketingSchema";
import { createEnquiryReference } from "../lib/createEnquiryReference";
import { isLikelyPhone, isLikelyUkPostcode } from "../lib/validation";

function validMovement(): MovementRequestValues {
  return {
    companyWebsite: "",
    fullName: "Sam Driver",
    companyName: "Dealership Ltd",
    email: "sam@example.com",
    telephone: "07123 456789",
    customerType: "dealership",
    vehicleRegistration: "AX24 TRA",
    vehicleMake: "Example",
    vehicleModel: "Hatchback",
    runningStatus: "runs_and_drives",
    roadworthy: "yes",
    motStatus: "valid",
    movementArrangement: "confirmed",
    knownDamage: "",
    collectionPostcode: "LS1 4DY",
    collectionContactName: "Alex",
    collectionInstructions: "",
    deliveryPostcode: "B1 1BB",
    deliveryContactName: "Jordan",
    deliveryInstructions: "",
    preferredDate: "Next week",
    dateFlexible: true,
    frequency: "one_off",
    additionalInstructions: "",
    consentAccurate: true,
    consentNotBooking: true,
    consentContact: true,
    consentPrivacy: true,
  };
}

function validDriver(): DriverApplicationValues {
  return {
    companyWebsite: "",
    fullName: "Sam Driver",
    email: "sam@example.com",
    telephone: "07123 456789",
    postcode: "LS1 4DY",
    licenceHeld: true,
    yearsDriving: "5",
    experience: "Dealer and auction movements",
    availability: "Weekdays",
    hasSmartphone: true,
    consentContact: true,
    consentPrivacy: true,
  };
}

describe("movementRequestSchema", () => {
  it("accepts a complete valid submission", () => {
    expect(movementRequestSchema.safeParse(validMovement()).success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const res = movementRequestSchema.safeParse({ ...validMovement(), fullName: "" });
    expect(res.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const res = movementRequestSchema.safeParse({ ...validMovement(), email: "not-an-email" });
    expect(res.success).toBe(false);
  });

  it("rejects an invalid postcode", () => {
    const res = movementRequestSchema.safeParse({ ...validMovement(), collectionPostcode: "ZZZ" });
    expect(res.success).toBe(false);
  });

  it("requires every consent box to be ticked", () => {
    const res = movementRequestSchema.safeParse({ ...validMovement(), consentNotBooking: false });
    expect(res.success).toBe(false);
  });

  it("rejects an unknown enum value", () => {
    const res = movementRequestSchema.safeParse({ ...validMovement(), customerType: "spaceship" });
    expect(res.success).toBe(false);
  });
});

describe("driverApplicationSchema", () => {
  it("accepts a valid application", () => {
    expect(driverApplicationSchema.safeParse(validDriver()).success).toBe(true);
  });

  it("requires a held licence confirmation", () => {
    const res = driverApplicationSchema.safeParse({ ...validDriver(), licenceHeld: false });
    expect(res.success).toBe(false);
  });
});

describe("validation helpers", () => {
  it("accepts real UK postcodes", () => {
    expect(isLikelyUkPostcode("LS1 4DY")).toBe(true);
    expect(isLikelyUkPostcode("b11bb")).toBe(true);
  });
  it("rejects nonsense postcodes", () => {
    expect(isLikelyUkPostcode("ZZZ")).toBe(false);
  });
  it("accepts plausible phone numbers and rejects short ones", () => {
    expect(isLikelyPhone("07123 456789")).toBe(true);
    expect(isLikelyPhone("123")).toBe(false);
  });
});

describe("createEnquiryReference", () => {
  it("matches the AXE-YYYYMMDD-XXXX format", () => {
    const ref = createEnquiryReference(new Date(Date.UTC(2026, 6, 15)));
    expect(ref).toMatch(/^AXE-20260715-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  });
  it("is non-sequential (two references differ)", () => {
    const a = createEnquiryReference();
    const b = createEnquiryReference();
    expect(a).not.toEqual(b);
  });
});
