import sys, json
J, OUT = sys.argv[1], sys.argv[2]
d = json.load(open(J))
fmt = lambda poly: "[" + ",".join(f"[{x:g},{y:g}]" for x, y in poly) + "]"
L = ["/**",
 " * Pixel-derived geometry for the supplied body-type artwork",
 " * (src/features/damage/assets/<type>/<view>.webp): vehicle outline (background",
 " * flood-fill + boundary trace), red lamp regions, and dark regions (glass, trim).",
 " * Image-pixel coordinates. GENERATED — do not hand-edit; regenerate if the art changes.",
 " */",
 'import type { Poly } from "../geometry/poly";', "",
 "export interface ArtPixels { w: number; h: number; outline: Poly; reds: Poly[]; darks: { area: number; bbox: [number, number, number, number]; poly: Poly }[] }", "",
 "export const ART_PIXELS: Record<string, ArtPixels> = {"]
for k, v in d.items():
    darks = [x for x in v["darks"] if x["area"] >= 400][:8]
    L.append(f'  "{k}": {{ w: {v["w"]}, h: {v["h"]}, outline: {fmt(v["outline"])},')
    L.append(f'    reds: [{",".join(fmt(r) for r in v["reds"])}],')
    L.append("    darks: [" + ",".join(f'{{ area: {x["area"]}, bbox: [{",".join(map(str, x["bbox"]))}], poly: {fmt(x["poly"])} }}' for x in darks) + "] },")
L.append("};")
open(OUT, "w").write("\n".join(L) + "\n")
