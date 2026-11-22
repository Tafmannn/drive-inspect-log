/**
 * Artwork-backed diagram families. A body type listed here is drawn with its
 * supplied illustration set; anything else falls back to the vector template.
 */
import type { BodyType } from "../bodyTypes";
import type { DiagramView, ViewId } from "../geometry/views";
import { buildFront, buildRear, buildSide, buildTop } from "./artBuilders";
import { ART_SPECS } from "./artSpecs";
import { buildVanArtView } from "./vanArtwork";

const URLS = import.meta.glob("../assets/*/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const urlOf = (bt: BodyType, v: ViewId) => URLS[`../assets/${bt}/${v}.webp`];

export function hasArtwork(bt: BodyType): boolean {
  return bt === "van" || !!ART_SPECS[bt];
}

export function buildArtView(bt: BodyType, view: ViewId): Omit<DiagramView, "bodyType"> | null {
  if (bt === "van") return buildVanArtView(view);
  const spec = ART_SPECS[bt];
  if (!spec) return null;
  const key = `${bt}:${view}`;
  const href = urlOf(bt, view);
  switch (view) {
    case "left": return buildSide("left", key, href, spec.left);
    case "right": return buildSide("right", key, href, spec.right);
    case "front": return buildFront(key, href, spec.front);
    case "rear": return buildRear(key, href, spec.rear);
    case "top": return buildTop(key, href, spec.top);
  }
}
