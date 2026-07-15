import { z } from "zod";
import { isLikelyPhone, isLikelyUkPostcode } from "./validation";

/**
 * Zod schemas for the public enquiry forms. Shared by the client (React Hook
 * Form) and mirrored by the Supabase Edge Functions, which re-validate server
 * side — never trust client validation alone.
 */

const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

const phone = z
  .string()
  .trim()
  .min(1, "Telephone is required")
  .refine(isLikelyPhone, "Enter a valid telephone number");

const postcode = z
  .string()
  .trim()
  .min(1, "Postcode is required")
  .refine(isLikelyUkPostcode, "Enter a valid UK postcode");

// Boolean refinement (not z.literal(true)) so React Hook Form sees a plain
// boolean field that starts false and must become true.
const consentTrue = (message: string) =>
  z.boolean().refine((v) => v === true, { message });

export const customerTypes = [
  "dealership",
  "dealer_group",
  "fleet",
  "rental",
  "leasing",
  "auction",
  "trade",
  "private",
  "other",
] as const;

export const runningStatuses = [
  "runs_and_drives",
  "starts_uncertain",
  "non_running",
  "unknown",
] as const;

export const roadworthyStatuses = ["yes", "no", "unsure"] as const;
export const motStatuses = ["valid", "expired", "unknown", "not_applicable"] as const;
export const movementArrangements = ["confirmed", "needs_discussion", "unknown"] as const;
export const frequencies = ["one_off", "recurring"] as const;

export const movementRequestSchema = z.object({
  // honeypot — must stay empty (bots fill it)
  companyWebsite: z.string().max(0).optional().default(""),

  // customer
  fullName: requiredText("Full name"),
  companyName: z.string().trim().max(200).optional().default(""),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  telephone: phone,
  customerType: z.enum(customerTypes, { message: "Select a customer type" }),

  // vehicle
  vehicleRegistration: requiredText("Vehicle registration", 12),
  vehicleMake: requiredText("Make", 60),
  vehicleModel: requiredText("Model", 60),
  runningStatus: z.enum(runningStatuses, { message: "Select the running status" }),
  roadworthy: z.enum(roadworthyStatuses, { message: "Select an option" }),
  motStatus: z.enum(motStatuses, { message: "Select an option" }),
  movementArrangement: z.enum(movementArrangements, { message: "Select an option" }),
  knownDamage: z.string().trim().max(1000).optional().default(""),

  // collection
  collectionPostcode: postcode,
  collectionContactName: requiredText("Collection contact"),
  collectionInstructions: z.string().trim().max(1000).optional().default(""),

  // delivery
  deliveryPostcode: postcode,
  deliveryContactName: requiredText("Delivery contact"),
  deliveryInstructions: z.string().trim().max(1000).optional().default(""),

  // movement
  preferredDate: z.string().trim().max(40).optional().default(""),
  dateFlexible: z.boolean().default(false),
  frequency: z.enum(frequencies, { message: "Select an option" }),
  additionalInstructions: z.string().trim().max(2000).optional().default(""),

  // consent
  consentAccurate: consentTrue("Please confirm the information is accurate"),
  consentNotBooking: consentTrue("Please acknowledge this is not a confirmed booking"),
  consentContact: consentTrue("Please agree to be contacted about your enquiry"),
  consentPrivacy: consentTrue("Please confirm you have read the privacy policy"),
});

export type MovementRequestInput = z.input<typeof movementRequestSchema>;
export type MovementRequestValues = z.infer<typeof movementRequestSchema>;

export const driverApplicationSchema = z.object({
  companyWebsite: z.string().max(0).optional().default(""), // honeypot

  fullName: requiredText("Full name"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  telephone: phone,
  postcode,
  licenceHeld: consentTrue("A full valid driving licence is required"),
  yearsDriving: z.string().trim().max(20).optional().default(""),
  experience: z.string().trim().max(2000).optional().default(""),
  availability: z.string().trim().max(200).optional().default(""),
  hasSmartphone: consentTrue("Smartphone capability is required for the role"),
  consentContact: consentTrue("Please agree to be contacted about your application"),
  consentPrivacy: consentTrue("Please confirm you have read the privacy policy"),
});

export type DriverApplicationInput = z.input<typeof driverApplicationSchema>;
export type DriverApplicationValues = z.infer<typeof driverApplicationSchema>;
