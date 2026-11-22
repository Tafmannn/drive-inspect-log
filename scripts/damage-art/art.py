"""Artwork toolkit: isolate vehicle, crop, trace outline, glass and red lamps.

usage: python3 -I art.py <zips_dir> <repo_assets_dir> <out_json>
"""
import sys, json
from collections import deque
from PIL import Image, ImageFilter
import numpy as np

X, ASSETS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
TYPES = ["suv", "saloon", "hatchback", "estate", "coupe", "convertible", "mpv", "pickup"]
VIEWS = ["top", "front", "rear", "left", "right"]
SIL_THR = int(sys.argv[4]) if len(sys.argv) > 4 else 236


def flood_bg(a, thr=236):
    h, w, _ = a.shape
    bgish = (a.min(axis=2) >= thr) & ((a.max(axis=2) - a.min(axis=2)) < (14 if thr >= 230 else 22))
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bgish[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bgish[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and bgish[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    return ~bg


def morph(m, k, op):
    im = Image.fromarray((m * 255).astype(np.uint8))
    f = ImageFilter.MinFilter(k) if op == "erode" else ImageFilter.MaxFilter(k)
    return np.asarray(im.filter(f)) > 127


def components(m, min_area=1):
    h, w = m.shape
    lab = np.zeros((h, w), np.int32)
    out = []
    cur = 0
    for y0 in range(h):
        row = m[y0]
        for x0 in np.where(row & (lab[y0] == 0))[0]:
            if lab[y0, x0]:
                continue
            cur += 1
            q = deque([(y0, x0)]); lab[y0, x0] = cur; n = 0
            while q:
                y, x = q.popleft(); n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = cur; q.append((ny, nx))
            if n >= min_area:
                out.append((cur, n))
    return lab, out


def contour(m):
    h, w = m.shape
    ys, xs = np.where(m)
    i = np.lexsort((xs, ys))[0]
    start = (ys[i], xs[i])
    dirs = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    pts = [start]; cur = start; back = 6
    while True:
        found = False
        for k in range(8):
            d = (back + 1 + k) % 8
            ny, nx = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
            if 0 <= ny < h and 0 <= nx < w and m[ny, nx]:
                cur = (ny, nx); back = (d + 4) % 8; found = True; break
        if not found or cur == start or len(pts) > 100000:
            break
        pts.append(cur)
    return [(x + 0.5, y + 0.5) for y, x in pts]


def dp(pts, eps):
    pts = np.array(pts, float)
    if len(pts) < 4:
        return [tuple(map(float, p)) for p in pts]
    keep = np.zeros(len(pts), bool); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = pts[a], pts[b]; seg = pts[a + 1:b]
        r = q - p; t = seg - p
        d = np.abs(r[0] * t[:, 1] - r[1] * t[:, 0]) / (np.hypot(*r) + 1e-9)
        i = int(np.argmax(d))
        if d[i] > eps:
            keep[a + 1 + i] = True
            stack += [(a, a + 1 + i), (a + 1 + i, b)]
    return [(round(float(x), 1), round(float(y), 1)) for x, y in pts[keep]]


def poly_of(mask, eps):
    if mask.sum() < 3:
        return None
    return dp(contour(mask), eps)


result = {}
for t in TYPES:
    for v in VIEWS:
        im = Image.open(f"{X}/axentra_{t}_individual_views/{t}-{v}.png").convert("RGB")
        if v == "top" and im.width > im.height:
            im = im.rotate(-90, expand=True)  # front (left) -> up
        a = np.asarray(im).astype(int)
        m = flood_bg(a)
        lab, comps = components(m)
        big = max(comps, key=lambda c: c[1])[0]
        body = lab == big
        keep = morph(body, 9, "dilate")
        a2 = a.copy(); a2[~keep] = 255
        ys, xs = np.where(body); pad = 6
        x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
        x1, y1 = min(a.shape[1], xs.max() + pad + 1), min(a.shape[0], ys.max() + pad + 1)
        crop = a2[y0:y1, x0:x1].astype(np.uint8)
        Image.fromarray(crop).save(f"{ASSETS}/{t}/{v}.webp", "WEBP", quality=88, method=6)
        # silhouette from a stricter flood: light-grey ground shadow = background
        ms = flood_bg(a, thr=SIL_THR)
        sl0, sc0 = components(ms)
        b = (sl0 == max(sc0, key=lambda c: c[1])[0])[y0:y1, x0:x1]
        # silhouette: open (drop antennas, thin shadow) then close (fill nicks)
        s = morph(morph(b, 5, "erode"), 5, "dilate")
        s = morph(morph(s, 5, "dilate"), 5, "erode")
        sl, sc = components(s)
        s = sl == max(sc, key=lambda c: c[1])[0]
        c = crop.astype(int)
        lum = c.mean(axis=2); sat = c.max(axis=2) - c.min(axis=2)
        # red lamps
        red = s & (c[:, :, 0] > 140) & (c[:, :, 1] < 110) & (c[:, :, 2] < 110) & (c[:, :, 0] - c[:, :, 1] > 60)
        red = morph(morph(red, 3, "dilate"), 3, "erode")
        rl, rc = components(red, min_area=25)
        reds = [poly_of(rl == k, 1.0) for k, n in sorted(rc, key=lambda q: -q[1])[:4]]
        # glass / dark: very dark, low saturation, inside silhouette
        dark = s & (lum < 95) & (sat < 45)
        dark = morph(morph(dark, 3, "dilate"), 3, "erode")
        dl, dc = components(dark, min_area=150)
        darks = []
        for k, n in sorted(dc, key=lambda q: -q[1])[:12]:
            mm = dl == k
            yy, xx = np.where(mm)
            darks.append({"area": int(n), "bbox": [int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max())], "poly": poly_of(mm, 1.2)})
        result[f"{t}:{v}"] = {
            "w": int(crop.shape[1]), "h": int(crop.shape[0]),
            "outline": poly_of(s, 1.0),
            "reds": [r for r in reds if r],
            "darks": darks,
        }
        print(t, v, crop.shape[1], crop.shape[0], "outline", len(result[f"{t}:{v}"]["outline"]), "reds", len(reds), "darks", [d["area"] for d in darks][:6], flush=True)
json.dump(result, open(OUT, "w"))
