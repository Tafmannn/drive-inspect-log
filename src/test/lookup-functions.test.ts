/**
 * The postcode-lookup and business-search edge functions, run end to end with
 * Google and the free services faked: what each function returns when Google
 * works, when Google refuses (billing off / API not enabled), and when the free
 * fallbacks fail too. Covers the real fallback order and the `degraded` flag
 * the job form relies on.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

type Handler = (req: Request) => Promise<Response>;
const h = vi.hoisted(() => ({ handlers: {} as Record<string, Handler>, current: "" }));

// The functions run on Deno: stub the std server (captures the handler) and the
// staff gate (this test is about lookup behaviour, not who may call it).
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({
  serve: (fn: Handler) => {
    h.handlers[h.current] = fn;
  },
}));
vi.mock("../../supabase/functions/_shared/staffAuth.ts", () => ({ checkStaff: async () => null }));

// ── A fake world: which Google / free-service calls succeed ─────────────────
interface World {
  places: "ok" | "refused" | "empty";
  geocode: "ok" | "refused" | "zero";
  legacy: "refused" | "zero";
  osm: "ok" | "empty" | "down";
  postcodesIo: "ok" | "notfound" | "down";
}
let world: World;
let calls: string[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const placesRefusal = { error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } };
const billingRefusal = { status: "REQUEST_DENIED", error_message: "You must enable Billing on the Google Cloud Project", results: [] };

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  calls.push(new URL(url).host + new URL(url).pathname);

  if (url.startsWith("https://places.googleapis.com/")) {
    if (world.places === "refused") return Promise.resolve(json(placesRefusal, 403));
    if (world.places === "empty") return Promise.resolve(json({}));
    return Promise.resolve(
      json({
        places: [
          {
            id: "g1",
            displayName: { text: "Acme Motors" },
            formattedAddress: "10 Example Road, Leeds LS1 1AA, UK",
            types: ["car_dealer"],
            addressComponents: [
              { types: ["street_number"], longText: "10" },
              { types: ["route"], longText: "Example Road" },
              { types: ["postal_town"], longText: "Leeds" },
              { types: ["postal_code"], longText: "LS1 1AA" },
            ],
          },
        ],
      }),
    );
  }
  if (url.startsWith("https://maps.googleapis.com/maps/api/geocode")) {
    if (world.geocode === "refused") return Promise.resolve(json(billingRefusal));
    if (world.geocode === "zero") return Promise.resolve(json({ status: "ZERO_RESULTS", results: [] }));
    return Promise.resolve(
      json({
        status: "OK",
        results: [
          {
            formatted_address: "1 Geo Street, Leeds LS1 1AA, UK",
            place_id: "geo1",
            types: ["street_address"],
            geometry: { location: { lat: 53.8, lng: -1.5 } },
            address_components: [
              { types: ["street_number"], long_name: "1" },
              { types: ["route"], long_name: "Geo Street" },
              { types: ["postal_town"], long_name: "Leeds" },
              { types: ["postal_code"], long_name: "LS1 1AA" },
            ],
          },
        ],
      }),
    );
  }
  if (url.startsWith("https://maps.googleapis.com/maps/api/place/textsearch")) {
    return Promise.resolve(
      json(world.legacy === "refused" ? { status: "REQUEST_DENIED", error_message: "legacy API not enabled", results: [] } : { status: "ZERO_RESULTS", results: [] }),
    );
  }
  if (url.startsWith("https://nominatim.openstreetmap.org/")) {
    if (world.osm === "down") return Promise.reject(new Error("osm unreachable"));
    if (world.osm === "empty") return Promise.resolve(json([]));
    return Promise.resolve(
      json([
        {
          place_id: 7, osm_id: 99, osm_type: "node", name: "Acme Motors", display_name: "Acme Motors, 5 Osm Lane, Leeds, LS1 1AA",
          type: "car_dealer", class: "shop", lat: "53.8", lon: "-1.5",
          address: { house_number: "5", road: "Osm Lane", city: "Leeds", postcode: "LS1 1AA" },
        },
      ]),
    );
  }
  if (url.startsWith("https://api.postcodes.io/")) {
    if (world.postcodesIo === "down") return Promise.reject(new Error("postcodes.io unreachable"));
    if (world.postcodesIo === "notfound") return Promise.resolve(json({ status: 404, error: "Postcode not found" }, 404));
    return Promise.resolve(json({ status: 200, result: { postcode: "LS1 1AA", admin_district: "Leeds", region: "Yorkshire and The Humber" } }));
  }
  return Promise.reject(new Error(`unexpected fetch: ${url}`));
}

const call = async (fn: "postcode-lookup" | "business-search", body: unknown) => {
  const res = await h.handlers[fn](
    new Request("https://x.test/fn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  return { status: res.status, body: await res.json() };
};

// Loaded through a computed path on purpose: the functions are Deno code (URL
// imports, the Deno global) that the app's type-check can't read, so it must not
// follow these imports. At run time they are still the real function files.
const loadFunction = (name: string) => import(/* @vite-ignore */ `../../supabase/functions/${name}/index.ts`);

beforeAll(async () => {
  vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "GOOGLE_MAPS_API_KEY" ? "test-key" : undefined) } });
  h.current = "postcode-lookup";
  await loadFunction("postcode-lookup");
  h.current = "business-search";
  await loadFunction("business-search");
});

beforeEach(() => {
  calls = [];
  world = { places: "ok", geocode: "ok", legacy: "zero", osm: "ok", postcodesIo: "ok" };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("postcode-lookup", () => {
  const lookup = () => call("postcode-lookup", { postcode: "ls1 1aa" });

  it("uses Google when it works, and is not degraded", async () => {
    const r = await lookup();
    expect(r.body).toMatchObject({ source: "google", degraded: false });
    expect(r.body.results[0]).toMatchObject({ line1: "10 Example Road", town: "Leeds", postcode: "LS1 1AA" });
    expect(calls.some((c) => c.includes("postcodes.io") || c.includes("nominatim"))).toBe(false);
  });

  it("Google refuses everything: falls back to OpenStreetMap and says the lookup is degraded", async () => {
    world.places = "refused";
    world.geocode = "refused";
    const r = await lookup();
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("openstreetmap");
    expect(r.body.degraded).toBe(true);
    expect(r.body.results.length).toBeGreaterThan(0);
  });

  it("Google refuses and OpenStreetMap has nothing: area-only answer from postcodes.io", async () => {
    world.places = "refused";
    world.geocode = "refused";
    world.osm = "empty";
    const r = await lookup();
    expect(r.body).toMatchObject({ source: "postcodes.io", degraded: true });
    expect(r.body.results).toEqual([
      { id: "postcodes-io:LS1 1AA", label: "LS1 1AA, Leeds area (street not available)", line1: "", town: "Leeds", postcode: "LS1 1AA" },
    ]);
  });

  it("a down fallback never hides the next one", async () => {
    world.places = "refused";
    world.geocode = "refused";
    world.osm = "down";
    const r = await lookup();
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("postcodes.io");
  });

  it("everything down: an empty answer that still says Google is degraded", async () => {
    world.places = "refused";
    world.geocode = "refused";
    world.osm = "down";
    world.postcodesIo = "down";
    const r = await lookup();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ results: [], error: "No addresses found", degraded: true });
  });

  it("a genuine no-match is NOT reported as degraded", async () => {
    world.places = "empty";
    world.geocode = "zero";
    world.osm = "empty";
    world.postcodesIo = "notfound";
    const r = await lookup();
    expect(r.body).toEqual({ results: [], error: "No addresses found", degraded: false });
  });

  it("Places refused but Geocoding works: Google results, not degraded", async () => {
    world.places = "refused";
    const r = await lookup();
    expect(r.body).toMatchObject({ source: "google", degraded: false });
    expect(r.body.results[0].line1).toBe("1 Geo Street");
  });

  it("logs why Google refused, without the key", async () => {
    world.places = "refused";
    world.geocode = "refused";
    await lookup();
    const logged = JSON.stringify((console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls);
    expect(logged).toContain("PERMISSION_DENIED");
    expect(logged).toContain("REQUEST_DENIED");
    expect(logged).not.toContain("test-key");
  });

  it("rejects something that isn't a UK postcode before calling anyone", async () => {
    const r = await call("postcode-lookup", { postcode: "hello" });
    expect(r.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("business-search", () => {
  const search = () => call("business-search", { query: "acme motors", postcode: "LS1 1AA" });

  it("uses Google when it works, and is not degraded", async () => {
    const r = await search();
    expect(r.body.degraded).toBe(false);
    expect(r.body.results[0]).toMatchObject({ placeId: "g1", name: "Acme Motors" });
  });

  it("Google refuses everything: OpenStreetMap results, flagged degraded", async () => {
    world.places = "refused";
    world.geocode = "refused";
    world.legacy = "refused";
    const r = await search();
    expect(r.status).toBe(200);
    expect(r.body.degraded).toBe(true);
    expect(r.body.results[0]).toMatchObject({ name: "Acme Motors", line1: "5 Osm Lane", city: "Leeds" });
  });

  it("everything down: empty, degraded, and the search does not crash", async () => {
    world.places = "refused";
    world.geocode = "refused";
    world.legacy = "refused";
    world.osm = "down";
    const r = await search();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ results: [], degraded: true });
  });

  it("a genuine no-match is NOT degraded", async () => {
    world.places = "empty";
    world.geocode = "zero";
    world.legacy = "zero";
    world.osm = "empty";
    const r = await search();
    expect(r.body).toEqual({ results: [], degraded: false });
  });

  it("a very short query is answered without calling anyone", async () => {
    const r = await call("business-search", { query: "a" });
    expect(r.body).toEqual({ results: [] });
    expect(calls).toEqual([]);
  });
});
