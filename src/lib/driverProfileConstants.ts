/**
 * Single source of truth for driver_profiles.employment_type, matching the
 * DB check constraint (driver_profiles_employment_type_check). Previously
 * hardcoded independently in four different forms, and two of them drifted
 * to "employee" instead of "employed" — a value the constraint rejects,
 * which 500'd every save that touched it.
 */
export const EMPLOYMENT_TYPES = [
  { value: "employed", label: "Employed" },
  { value: "contractor", label: "Contractor" },
  { value: "agency", label: "Agency" },
  { value: "self_employed", label: "Self-employed" },
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]["value"];
