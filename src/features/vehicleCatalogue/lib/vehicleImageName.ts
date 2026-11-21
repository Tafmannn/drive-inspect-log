/**
 * Parse Axentra catalogue file names into vehicle_catalogue_images rows.
 *
 * Expected: make-model-yearfrom-yearto-colour.png (a single year is allowed),
 * lowercase with hyphens, e.g.
 *   bmw-x5-2019-2023-black.png
 *   mercedes-benz-c-class-2014-2021-blue.png
 *   land-rover-range-rover-sport-2022-2025-white.png
 *
 * Pure: no I/O. The upload page shows the result for review before saving.
 */

export const CATALOGUE_COLOURS = [
  "black", "white", "silver", "grey", "blue", "red", "green",
  "yellow", "orange", "brown", "beige", "gold", "purple",
] as const;

export const CATALOGUE_BODY_TYPES = [
  "SUV", "saloon", "hatchback", "estate", "coupe", "convertible", "MPV", "van", "pickup",
] as const;

/** Multi-word makes, as hyphenated slugs, mapped to their display spelling. Longest match wins. */
const MULTI_WORD_MAKES: Record<string, string> = {
  "mercedes-benz": "Mercedes-Benz",
  "land-rover": "Land Rover",
  "alfa-romeo": "Alfa Romeo",
  "aston-martin": "Aston Martin",
  "rolls-royce": "Rolls-Royce",
};

/** Single-word makes whose spelling is not simple title case. */
const MAKE_SPELLING: Record<string, string> = {
  bmw: "BMW", mini: "MINI", mg: "MG", ds: "DS", seat: "SEAT", byd: "BYD",
  vw: "Volkswagen", mercedes: "Mercedes-Benz",
};

export interface ParsedVehicleImage {
  fileName: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  colour: string;
}

export type ParseResult =
  | { ok: true; value: ParsedVehicleImage }
  | { ok: false; fileName: string; error: string };

const FILE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(png|webp)$/;
const YEAR_RE = /^(19|20)\d{2}$/;

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "x5" -> "X5", "a3" -> "A3", "c" -> "C", "series" -> "Series", "3" -> "3". */
function formatModelWord(word: string): string {
  if (/\d/.test(word) || word.length <= 2) return word.toUpperCase();
  return titleCase(word);
}

export function parseVehicleImageName(fileName: string): ParseResult {
  const fail = (error: string): ParseResult => ({ ok: false, fileName, error });

  if (!FILE_RE.test(fileName)) {
    return fail("Name must be lowercase letters, numbers and hyphens, ending .png or .webp");
  }
  const tokens = fileName.replace(/\.(png|webp)$/, "").split("-");

  const colour = tokens.pop() ?? "";
  if (!(CATALOGUE_COLOURS as readonly string[]).includes(colour)) {
    return fail(`Last part "${colour}" is not a catalogue colour`);
  }

  const years: number[] = [];
  while (tokens.length && YEAR_RE.test(tokens[tokens.length - 1]) && years.length < 2) {
    years.unshift(Number(tokens.pop()));
  }
  if (years.length === 0) return fail("Missing year (expected …-2019-2023-colour.png)");
  const [yearFrom, yearTo = yearFrom] = years;
  if (yearFrom > yearTo) return fail(`Year range ${yearFrom}–${yearTo} is backwards`);

  if (tokens.length < 2) return fail("Missing make or model");

  let make: string | undefined;
  let modelTokens = tokens;
  for (const slug of Object.keys(MULTI_WORD_MAKES).sort((a, b) => b.length - a.length)) {
    const parts = slug.split("-");
    if (parts.every((p, i) => tokens[i] === p) && tokens.length > parts.length) {
      make = MULTI_WORD_MAKES[slug];
      modelTokens = tokens.slice(parts.length);
      break;
    }
  }
  if (!make) {
    make = MAKE_SPELLING[tokens[0]] ?? titleCase(tokens[0]);
    modelTokens = tokens.slice(1);
  }

  const model = modelTokens.map(formatModelWord).join(" ");
  return { ok: true, value: { fileName, make, model, yearFrom, yearTo, colour } };
}

/** Rows that would break the database's no-overlap rule within one batch. */
export function findOverlaps(rows: ParsedVehicleImage[]): Set<string> {
  const clash = new Set<string>();
  const key = (r: ParsedVehicleImage) =>
    `${r.make.toLowerCase()}|${r.model.toLowerCase()}|${r.colour.toLowerCase()}`;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (key(a) === key(b) && a.yearFrom <= b.yearTo && b.yearFrom <= a.yearTo) {
        clash.add(a.fileName);
        clash.add(b.fileName);
      }
    }
  }
  return clash;
}
