/**
 * UK Clean Air Zone / ULEZ lookup — static, by postcode district.
 *
 * Deliberately NOT a paid third-party API: UK CAZ/ULEZ zones are a small,
 * fixed, named set that changes rarely (new zones, or rate changes, are
 * announced well in advance) — a reviewed-periodically static table is
 * sufficient and has zero running cost or latency.
 *
 * PRECISION, STATED HONESTLY: matching is by postcode district/area, not
 * zone-boundary geofencing. A handful of UK postcode districts straddle a
 * zone boundary, so this can occasionally flag (or miss) a job near an
 * edge. That's an accepted limitation for v1, not a silent gap — anyone
 * reading `caz_ulez_flag` sees a real zone name, and the admin can always
 * clear or adjust `caz_ulez_cost` on the job, exactly like any other
 * admin-entered price field.
 *
 * CHARGE PRECISION: each zone lists ONE representative daily rate (the
 * standard non-compliant light-vehicle/car rate, where that zone charges
 * cars at all). Several of these zones only charge vans/taxis/HGVs/buses,
 * never private cars — that's called out in `note` rather than silently
 * assumed. This app doesn't track a vehicle's Euro emission standard, so
 * "is this specific vehicle actually non-compliant" is never claimed —
 * only "this route touches a zone that may charge," same spirit as
 * pricingBrain.ts's own warnings-not-guesses discipline.
 */

export interface CazZone {
  name: string;
  /** Representative daily charge in GBP for a non-compliant light vehicle. */
  dailyCharge: number;
  /** Shown alongside the flag when the zone's rules materially differ from "any non-compliant car is charged". */
  note?: string;
  /** Match the postcode's full AREA (letters only, e.g. "SW", "E") — for zones covering a whole postcode area. */
  areas?: string[];
  /** Match the postcode's exact outward code (e.g. "BS1", "B1") — for zones narrower than a full postcode area. */
  districts?: string[];
}

export const CAZ_ZONES: CazZone[] = [
  {
    name: "London ULEZ",
    dailyCharge: 12.5,
    note: "car/van rate — HGV/bus rate differs",
    areas: [
      "E", "EC", "N", "NW", "SE", "SW", "W", "WC",
      "BR", "CR", "DA", "EN", "HA", "IG", "KT", "RM", "SM", "TW", "UB", "WD",
    ],
  },
  {
    name: "Birmingham Clean Air Zone",
    dailyCharge: 8,
    districts: ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B12", "B16", "B18", "B19"],
  },
  {
    name: "Bristol Clean Air Zone",
    dailyCharge: 9,
    note: "vans/taxis/HGVs/buses only — not private cars",
    districts: ["BS1", "BS2", "BS3", "BS4", "BS5", "BS6", "BS7", "BS8", "BS16"],
  },
  {
    name: "Bath Clean Air Zone",
    dailyCharge: 9,
    note: "vans/taxis/HGVs/buses only — not private cars",
    districts: ["BA1", "BA2"],
  },
  {
    name: "Portsmouth Clean Air Zone",
    dailyCharge: 10,
    note: "vans/taxis/HGVs/buses only — not private cars",
    districts: ["PO1", "PO2", "PO3", "PO4", "PO5", "PO6"],
  },
  {
    name: "Sheffield Clean Air Zone",
    dailyCharge: 10,
    note: "vans/taxis/HGVs/buses only — not private cars",
    districts: ["S1", "S2", "S3", "S4", "S9", "S10", "S11"],
  },
];

function normalisedOutwardCode(postcode: string): string | null {
  const compact = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (compact.length < 5) return null;
  return compact.slice(0, compact.length - 3);
}

function postcodeArea(outward: string): string {
  return outward.match(/^[A-Z]{1,2}/)?.[0] ?? "";
}

/** Returns the zone a single postcode falls in, or null if none match. */
export function lookupCazZone(postcode: string): CazZone | null {
  const outward = normalisedOutwardCode(postcode);
  if (!outward) return null;
  const area = postcodeArea(outward);

  for (const zone of CAZ_ZONES) {
    if (zone.districts?.includes(outward)) return zone;
    if (zone.areas?.includes(area)) return zone;
  }
  return null;
}

/**
 * Suggested CAZ/ULEZ flag + cost for a job, checking pickup and delivery
 * postcodes independently (not the full route path between them — see
 * module doc). Distinct zones touched are each charged once and summed;
 * the same zone touched at both ends is charged only once.
 */
export function computeJobCaz(
  pickupPostcode: string | null | undefined,
  deliveryPostcode: string | null | undefined,
): { flag: string | null; cost: number | null } {
  const zones = new Map<string, CazZone>();
  for (const pc of [pickupPostcode, deliveryPostcode]) {
    if (!pc) continue;
    const zone = lookupCazZone(pc);
    if (zone) zones.set(zone.name, zone);
  }

  if (zones.size === 0) return { flag: null, cost: null };

  const list = Array.from(zones.values());
  const flag = list
    .map((z) => (z.note ? `${z.name} (${z.note})` : z.name))
    .join(" + ");
  const cost = list.reduce((sum, z) => sum + z.dailyCharge, 0);

  return { flag, cost };
}
