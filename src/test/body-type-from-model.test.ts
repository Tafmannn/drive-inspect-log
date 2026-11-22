import { describe, expect, it } from "vitest";
import { inferBodyTypeFromModel } from "@/features/damage/bodyTypeFromModel";

const bt = (make: string, model: string) => inferBodyTypeFromModel(make, model)?.bodyType ?? null;

describe("inferBodyTypeFromModel", () => {
  it.each([
    // single-shape families (case/spacing as found in real job data)
    ["KIA", "Sportage", "suv"], ["BMW", "X5", "suv"], ["BMW", "iX3", "suv"], ["BMW", "X1", "suv"],
    ["LAND ROVER", "Evoque", "suv"], ["LAND ROVER", "Range Rover Evoque", "suv"], ["Land Rover", "Range Rover Sport", "suv"],
    ["MERCEDES-BENZ", "GLE 400 E AMG Line", "suv"], ["MERCEDES-BENZ", "GLC 300 URBAN EDITION E 4M", "suv"],
    ["MERCEDES-BENZ", "EQC 400 AMG LINE", "suv"], ["TESLA", "Model X", "suv"], ["Volvo", "XC90", "suv"],
    ["VOLKSWAGEN", "TIGUAN MATCH TDI BMT 4MOTN SA", "suv"], ["VOLKSWAGEN", "T-roc", "suv"], ["CUPRA", "Formento", "suv"],
    ["Ford", "EcoSport", "suv"], ["FORD", "Puma", "suv"], ["SKODA", "Kodiaq", "suv"],
    ["TOYOTA", "RAV4 2.5 PHEV DYNAMIC 4WD StationWagon", "suv"], // DVLA "station wagon" ≠ estate
    ["HYUNDAI", "Getz", "hatchback"], ["CITROEN", "C3", "hatchback"], ["VAUXHALL", "Corsa", "hatchback"],
    ["BMW", "7 Series", "saloon"], ["BMW", "i4", "saloon"],
    ["FORD", "Transit", "van"], ["MERCEDES-BENZ", "Sprinter", "van"], ["VAUXHALL", "Vivaro", "van"],
    ["Ford", "Ranger", "pickup"], ["Ford", "Galaxy", "mpv"],
    // multi-shape family, body named in the model text
    ["TOYOTA", "AURIS 1.8 HYBRID EXCEL Hatchback", "hatchback"], ["Volkswagen", "Passat Estate", "estate"],
    ["BMW", "3 Series Touring", "estate"], ["Audi", "A3 Cabriolet", "convertible"],
    // rare variant named explicitly
    ["LAND ROVER", "Evoque Convertible", "convertible"], ["VOLKSWAGEN", "T-Roc Cabriolet", "convertible"],
  ])("%s %s → %s", (make, model, expected) => expect(bt(make, model)).toBe(expected));

  it.each([
    // families sold in several shapes, text doesn't say which
    ["Audi", "A3"], ["AUDI", "A6"], ["BMW", "1 Series"], ["BMW", "2 Series"], ["BMW", "3 Series"], ["BMW", "5 Series"],
    ["BMW", "8 Series"], ["BMW", "I5"], ["BMW", "M440d"], ["MERCEDES-BENZ", "E220d"], ["MERCEDES-BENZ", "EClass"],
    ["VOLKSWAGEN", "Golf"], ["Volkswagen", "Beatle"], ["SKODA", "Octavia"], ["TOYOTA", "Auris"], ["Ford", "Focus"],
    ["Cupra", "Leon"], ["CITROEN", "Berlingo"],
    // unknown / mismatched / empty — never guessed, never from make alone
    ["LEXUS", "S500"], ["", ""], ["BMW", ""], ["", "Golf"], ["Ford", "Transit Chassis Cab"], ["MERCEDES-BENZ", "Sprinter Minibus"],
  ])("%s %s → not decided", (make, model) => expect(bt(make, model)).toBeNull());

  it("reports how it decided", () => {
    expect(inferBodyTypeFromModel("KIA", "Sportage")?.basis).toBe("family");
    expect(inferBodyTypeFromModel("TOYOTA", "Auris Hatchback")?.basis).toBe("text");
  });
});
