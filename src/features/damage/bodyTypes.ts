/**
 * Generic body-type families for the damage diagram.
 *
 * These are inspection TEMPLATES, not manufacturer schematics: one drawing
 * family per body shape. The family for a job is resolved from the job's own
 * recorded data — never guessed from the manufacturer, and an unknown vehicle
 * is never silently drawn as a saloon (the UI asks instead).
 */
import { inferBodyTypeFromModel } from "./bodyTypeFromModel";

export const BODY_TYPES = [
  "suv",
  "saloon",
  "hatchback",
  "estate",
  "coupe",
  "convertible",
  "mpv",
  "van",
  "pickup",
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  suv: "SUV / Crossover",
  saloon: "Saloon",
  hatchback: "Hatchback",
  estate: "Estate",
  coupe: "Coupe",
  convertible: "Convertible",
  mpv: "MPV",
  van: "Van",
  pickup: "Pickup",
};

export function isBodyType(v: unknown): v is BodyType {
  return typeof v === "string" && (BODY_TYPES as readonly string[]).includes(v);
}

/**
 * Synonyms seen in DVLA/VRM lookups, platform job feeds and free-typed admin
 * input. Matching is on whole normalised words/phrases, most specific first.
 * Ambiguous strings ("car", "4x4", "commercial", "MPV/SUV") deliberately do
 * NOT resolve.
 */
const SYNONYMS: Array<[RegExp, BodyType]> = [
  [/\b(pick ?up|pickup truck|double cab|crew cab|single cab|king cab|super cab)\b/, "pickup"],
  [/\b(convertible|cabriolet|cabrio|roadster|spyder|spider|drophead|soft ?top)\b/, "convertible"],
  [/\b(panel van|van|lwb van|swb van|crew van|minibus|luton|box van|combi van|high roof)\b/, "van"],
  [/\b(estate|station wagon|wagon|touring|avant|tourer|sportswagon|shooting brake|sports tourer|variant)\b/, "estate"],
  [/\b(m\.?p\.?v|people carrier|multi purpose|minivan|mini van)\b/, "mpv"],
  [/\b(s\.?u\.?v|crossover|sport utility|off ?roader|all terrain)\b/, "suv"],
  [/\b(coupe|fastback)\b/, "coupe"],
  [/\b(hatchback|hatch|liftback|sportback)\b/, "hatchback"],
  [/\b(saloon|sedan|limousine|notchback)\b/, "saloon"],
];

/** Normalise a free-text body description. Returns null when not confidently one family. */
export function normaliseBodyType(raw: string | null | undefined): BodyType | null {
  if (!raw) return null;
  const s = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // coupé → coupe
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  if (isBodyType(s)) return s;
  const hits = new Set<BodyType>();
  for (const [re, bt] of SYNONYMS) if (re.test(s)) hits.add(bt);
  // "MPV/SUV" style strings name two families — ambiguous, so ask the driver.
  if (hits.size !== 1) {
    // A coupe-SUV / "sportback" hatch-coupe is still not one shape: refuse.
    return null;
  }
  return [...hits][0];
}

export type BodyTypeSource = "job" | "catalogue" | "model" | "manual";

export interface BodyTypeResolution {
  bodyType: BodyType | null;
  source: BodyTypeSource | null;
  /** The raw text it came from, for display/audit. */
  raw: string | null;
}

/**
 * Priority: (1) manual choice already made for this inspection draft,
 * (2) the job's recorded body type, (3) the shared vehicle catalogue entry the
 * job is matched to, (4) the job's make + model when that model only comes in
 * one shape (bodyTypeFromModel.ts), (5) nothing → the body-type picker.
 */
export function resolveBodyType(input: {
  manual?: string | null;
  jobVehicleType?: string | null;
  catalogueBodyType?: string | null;
  make?: string | null;
  model?: string | null;
}): BodyTypeResolution {
  if (isBodyType(input.manual)) return { bodyType: input.manual, source: "manual", raw: input.manual };
  const fromJob = normaliseBodyType(input.jobVehicleType);
  if (fromJob) return { bodyType: fromJob, source: "job", raw: input.jobVehicleType ?? null };
  const fromCat = normaliseBodyType(input.catalogueBodyType);
  if (fromCat) return { bodyType: fromCat, source: "catalogue", raw: input.catalogueBodyType ?? null };
  const fromModel = inferBodyTypeFromModel(input.make, input.model);
  if (fromModel) {
    return { bodyType: fromModel.bodyType, source: "model", raw: [input.make, input.model].filter(Boolean).join(" ") };
  }
  return { bodyType: null, source: null, raw: input.jobVehicleType ?? input.catalogueBodyType ?? null };
}
