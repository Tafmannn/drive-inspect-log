import sys
from PIL import Image, ImageDraw
ASSETS, t, v, out = sys.argv[1:5]
scale = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
im = Image.open(f"{ASSETS}/{t}/{v}.webp").convert("RGB")
im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
d = ImageDraw.Draw(im)
for x in range(0, int(im.width / scale) + 1, 10):
    X = x * scale
    c = (255, 0, 0) if x % 100 == 0 else ((255, 150, 150) if x % 50 == 0 else (255, 225, 225))
    if x % 50 == 0 or scale >= 1.5: d.line([(X, 0), (X, im.height)], fill=c, width=1)
    if x % 50 == 0: d.text((X + 2, 2), str(x), fill=(200, 0, 0))
for y in range(0, int(im.height / scale) + 1, 10):
    Y = y * scale
    c = (0, 0, 255) if y % 100 == 0 else ((150, 150, 255) if y % 50 == 0 else (225, 225, 255))
    if y % 50 == 0 or scale >= 1.5: d.line([(0, Y), (im.width, Y)], fill=c, width=1)
    if y % 50 == 0: d.text((2, Y + 2), str(y), fill=(0, 0, 200))
im.save(out)
