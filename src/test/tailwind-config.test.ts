import { describe, it, expect } from "vitest";
import config from "../../tailwind.config";

describe("tailwind config", () => {
  it("applies hover styles only where a real pointer can hover, so a tapped card on a phone doesn't stay 'hovered'", () => {
    expect(config.future).toEqual({ hoverOnlyWhenSupported: true });
  });
});
