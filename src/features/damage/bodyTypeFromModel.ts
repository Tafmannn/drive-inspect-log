/**
 * Conservative body-type inference from a job's make + model.
 *
 * Only answers when it can be sure:
 *   • the model family is built in ONE body shape (Kia Sportage → SUV), or
 *   • the family has variants but the model text names the body
 *     ("Auris … Hatchback"), or a rare variant is named explicitly
 *     ("Evoque Convertible").
 * Families sold in several shapes (Golf, 3 Series, A3, E-Class, Octavia …)
 * return null unless the text says which. Never decides from the make alone.
 *
 * Note DVLA-style descriptions call most SUVs "Station Wagon"; for SUV
 * families that word is ignored rather than read as "estate".
 */
import { normaliseBodyType, type BodyType } from "./bodyTypes";

export interface ModelInference {
  bodyType: BodyType;
  /** "family" = single-shape model family; "text" = body named in the model string */
  basis: "family" | "text";
  rule: string;
}

interface Rule {
  make: RegExp;
  model: RegExp;
  /** set = single shape (or overwhelmingly so, with named variants handled by `variants`) */
  body?: BodyType;
  /** words in the model text that switch to a named variant */
  variants?: Array<[RegExp, BodyType]>;
  /** families sold in several shapes: only the model text can decide */
  split?: true;
}

const CONV: [RegExp, BodyType] = [/\b(convertible|cabriolet|cabrio|roadster)\b/, "convertible"];

const RULES: Rule[] = [
  // SUVs / crossovers
  { make: /^bmw$/, model: /^(x[1-7]|ix|ix[1-3])\b/, body: "suv" },
  { make: /^land rover$/, model: /^(range rover|discovery|defender|evoque)/, body: "suv", variants: [CONV] },
  { make: /^kia$/, model: /^(sportage|sorento|niro|ev9|xceed|stonic)/, body: "suv" },
  { make: /^hyundai$/, model: /^(tucson|santa fe|kona|ioniq 5|bayon)/, body: "suv" },
  { make: /^mercedes(-benz)?$/, model: /^(gl[abce]|gls|eq[abc]\b|eqc|ml\b|g ?class)/, body: "suv" },
  { make: /^ford$/, model: /^(ecosport|puma|kuga|explorer|edge)/, body: "suv" },
  { make: /^skoda$/, model: /^(kodiaq|karoq|kamiq|enyaq)/, body: "suv" },
  { make: /^tesla$/, model: /^model [xy]\b/, body: "suv" },
  { make: /^toyota$/, model: /^(rav4|rav 4|c-?hr|yaris cross|land cruiser|highlander)/, body: "suv" },
  { make: /^volkswagen$/, model: /^(tiguan|touareg|t-?roc|t-?cross|taigo|id\.?[45]\b)/, body: "suv", variants: [CONV] },
  { make: /^volvo$/, model: /^(xc|ex)\d0/, body: "suv" },
  { make: /^cupra$/, model: /^(formentor|formento|ateca|born\b|tavascan)/, body: "suv" },
  { make: /^nissan$/, model: /^(qashqai|juke|x-?trail|ariya)/, body: "suv" },
  { make: /^(audi)$/, model: /^(q[2-8]|e-?tron)\b/, body: "suv" },
  { make: /^porsche$/, model: /^(cayenne|macan)/, body: "suv" },
  // single-shape cars
  { make: /^bmw$/, model: /^7 ?series\b/, body: "saloon" },
  { make: /^bmw$/, model: /^i4\b/, body: "saloon" },
  { make: /^citroen$/, model: /^c3\b(?! aircross)/, body: "hatchback" },
  { make: /^hyundai$/, model: /^(getz|i10|i20)\b/, body: "hatchback" },
  { make: /^vauxhall$/, model: /^corsa\b(?!van)/, body: "hatchback" },
  { make: /^ford$/, model: /^fiesta\b/, body: "hatchback" },
  // vans (panel-van template; chassis-cab/minibus variants named explicitly fall through)
  { make: /^ford$/, model: /^transit\b(?!.*(chassis|tipper|minibus|connect.*kombi))/, body: "van" },
  { make: /^mercedes(-benz)?$/, model: /^(sprinter|vito)\b(?!.*(chassis|tipper|tourer|minibus))/, body: "van" },
  { make: /^vauxhall$/, model: /^(vivaro|movano|combo)\b(?!.*life)/, body: "van" },
  { make: /^volkswagen$/, model: /^(transporter|crafter|caddy cargo)\b/, body: "van" },
  // pickups
  { make: /^ford$/, model: /^ranger\b/, body: "pickup" },
  { make: /^toyota$/, model: /^hilux\b/, body: "pickup" },
  { make: /^nissan$/, model: /^navara\b/, body: "pickup" },
  // MPVs
  { make: /^ford$/, model: /^(galaxy|s-?max)\b/, body: "mpv" },
  // families sold in several shapes — only explicit text decides
  { make: /^bmw$/, model: /^([1-6]|8) ?series|^m\d{3}|^i5\b|^[1-8]\d{2}[a-z]{0,2}\b/, split: true },
  { make: /^audi$/, model: /^(a[1-8]|s[1-8]|rs ?\d)\b/, split: true },
  { make: /^mercedes(-benz)?$/, model: /^([a-es]|cl[as]|cla|cls)[ -]?(class)?\b|^[a-es] ?\d{3}|^eclass/, split: true },
  { make: /^volkswagen$/, model: /^(golf|polo|passat|arteon|beetle|beatle|id\.?3)\b/, split: true },
  { make: /^skoda$/, model: /^(octavia|superb|fabia|scala)\b/, split: true },
  { make: /^toyota$/, model: /^(auris|corolla|yaris)\b/, split: true },
  { make: /^ford$/, model: /^(focus|mondeo)\b/, split: true },
  { make: /^cupra$/, model: /^leon\b/, split: true },
  { make: /^citroen$/, model: /^berlingo\b/, split: true },
];

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export function inferBodyTypeFromModel(make: string | null | undefined, model: string | null | undefined): ModelInference | null {
  const mk = norm(make), md = norm(model);
  if (!mk || !md) return null;
  const rule = RULES.find((r) => r.make.test(mk) && r.model.test(md));
  if (!rule) return null;
  const label = `${mk} ${rule.model.source}`;
  if (rule.split) {
    // e.g. "AURIS 1.8 HYBRID EXCEL Hatchback", "Passat Estate", "A3 Cabriolet"
    const named = normaliseBodyType(md);
    return named ? { bodyType: named, basis: "text", rule: label } : null;
  }
  for (const [re, bt] of rule.variants ?? []) if (re.test(md)) return { bodyType: bt, basis: "text", rule: label };
  if (rule.body === "suv" || rule.body === "van" || rule.body === "pickup") {
    // ignore DVLA "station wagon" and similar on single-shape families
    return { bodyType: rule.body, basis: "family", rule: label };
  }
  // a single-shape car family whose text names a DIFFERENT body is a data clash: don't guess
  const named = normaliseBodyType(md);
  if (named && named !== rule.body) return null;
  return { bodyType: rule.body!, basis: "family", rule: label };
}

