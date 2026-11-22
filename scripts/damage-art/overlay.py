import sys, json
from PIL import Image, ImageDraw
J, ASSETS, OUT, t = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
data = json.load(open(J))
views = ["left", "right", "front", "rear", "top"]
tiles = []
for v in views:
    d = data[f"{t}:{v}"]
    im = Image.open(f"{ASSETS}/{t}/{v}.webp").convert("RGB")
    dr = ImageDraw.Draw(im)
    o = [tuple(p) for p in d["outline"]]
    dr.line(o + [o[0]], fill=(255, 0, 255), width=2)
    for r in d["reds"]:
        r = [tuple(p) for p in r]; dr.line(r + [r[0]], fill=(0, 200, 0), width=2)
    for i, k in enumerate(d["darks"][:8]):
        p = [tuple(q) for q in k["poly"]]
        dr.line(p + [p[0]], fill=(0, 90, 255), width=1)
        bx = k["bbox"]; dr.text((bx[0] + 2, bx[1] + 2), str(i), fill=(255, 0, 0))
    tiles.append(im)
H = 330
tiles = [im.resize((int(im.width * H / im.height), H)) for im in tiles]
W = sum(i.width for i in tiles[:2]) + 10
row2 = sum(i.width for i in tiles[2:]) + 20
sheet = Image.new("RGB", (max(W, row2), H * 2 + 10), "white")
x = 0
for i in tiles[:2]:
    sheet.paste(i, (x, 0)); x += i.width + 10
x = 0
for i in tiles[2:]:
    sheet.paste(i, (x, H + 10)); x += i.width + 10
sheet.save(OUT)
