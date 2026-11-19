import { describe, it, expect } from "vitest";
import { parseAutocomplete } from "../../supabase/functions/_shared/addressAutocomplete";

const pred = (placeId: string, main: string, secondary: string) => ({
  placePrediction: {
    placeId,
    text: { text: `${main}, ${secondary}` },
    structuredFormat: { mainText: { text: main }, secondaryText: { text: secondary } },
  },
});

describe("parseAutocomplete", () => {
  it("maps predictions to placeId, headline and rest of address", () => {
    const out = parseAutocomplete({ suggestions: [pred("abc", "10 Downing Street", "London, UK")] });
    expect(out).toEqual([
      { placeId: "abc", main: "10 Downing Street", secondary: "London, UK", text: "10 Downing Street, London, UK" },
    ]);
  });

  it("falls back to the full text when there is no structured format", () => {
    const out = parseAutocomplete({ suggestions: [{ placePrediction: { placeId: "x", text: { text: "1 High St, Leeds" } } }] });
    expect(out[0]).toMatchObject({ main: "1 High St, Leeds", secondary: "" });
  });

  it("skips query suggestions and entries without a place id", () => {
    const out = parseAutocomplete({
      suggestions: [{ queryPrediction: { text: { text: "pizza" } } }, { placePrediction: { text: { text: "no id" } } }, pred("ok", "A", "B")],
    });
    expect(out.map(o => o.placeId)).toEqual(["ok"]);
  });

  it("returns at most 8 results", () => {
    const suggestions = Array.from({ length: 12 }, (_, i) => pred(`p${i}`, `${i} Road`, "UK"));
    expect(parseAutocomplete({ suggestions })).toHaveLength(8);
  });

  it("returns an empty list for anything unusable", () => {
    for (const bad of [null, undefined, {}, { suggestions: "x" }, "x", 5]) {
      expect(parseAutocomplete(bad)).toEqual([]);
    }
  });
});
