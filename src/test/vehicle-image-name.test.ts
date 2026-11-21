import { describe, it, expect } from "vitest";
import { findOverlaps, parseVehicleImageName } from "@/features/vehicleCatalogue/lib/vehicleImageName";

const ok = (name: string) => {
  const r = parseVehicleImageName(name);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("parseVehicleImageName", () => {
  it("parses a year range", () => {
    expect(ok("bmw-x5-2019-2023-black.png")).toMatchObject({
      make: "BMW", model: "X5", yearFrom: 2019, yearTo: 2023, colour: "black",
    });
  });

  it("allows a single year", () => {
    expect(ok("ford-focus-2021-blue.png")).toMatchObject({ make: "Ford", model: "Focus", yearFrom: 2021, yearTo: 2021 });
  });

  it("handles multi-word makes and models", () => {
    expect(ok("mercedes-benz-c-class-2014-2021-blue.png")).toMatchObject({ make: "Mercedes-Benz", model: "C Class" });
    expect(ok("land-rover-range-rover-sport-2022-2025-white.png")).toMatchObject({
      make: "Land Rover", model: "Range Rover Sport",
    });
    expect(ok("bmw-3-series-2019-2022-grey.png")).toMatchObject({ model: "3 Series" });
    expect(ok("volkswagen-id3-2020-2023-white.webp")).toMatchObject({ make: "Volkswagen", model: "ID3" });
  });

  it("rejects bad names with a reason", () => {
    for (const bad of [
      "BMW-X5-2019-2023-black.png",
      "bmw-x5-2019-2023-black (1).png",
      "bmw-x5-2019-2023-pink.png",
      "bmw-x5-black.png",
      "bmw-2019-2023-black.png",
      "bmw-x5-2023-2019-black.png",
      "bmw-x5-2019-2023-black.jpg",
    ]) {
      const r = parseVehicleImageName(bad);
      expect(r.ok, bad).toBe(false);
    }
  });
});

describe("findOverlaps", () => {
  it("flags overlapping years for the same make, model and colour only", () => {
    const rows = [
      ok("bmw-x5-2019-2023-black.png"),
      ok("bmw-x5-2023-2025-black.png"),
      ok("bmw-x5-2019-2023-white.png"),
      ok("bmw-x5-2013-2018-black.png"),
    ];
    expect([...findOverlaps(rows)].sort()).toEqual(["bmw-x5-2019-2023-black.png", "bmw-x5-2023-2025-black.png"]);
  });
});
