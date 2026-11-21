#!/usr/bin/env python3
"""Axentra free vehicle image pipeline (pilot-first).

Stages (run in order, each is restartable):
  index     fetch + cache the carimages-rights CSV (metadata only, no images)
  match     find candidate photos per manifest row, classify licences
  download  fetch candidate originals from Wikimedia Commons (rate-limited, resumable)
  sheet     build contact sheets for HUMAN visual review
  process   fit ACCEPTED photos onto a 1536x1024 white canvas (no stretching)
  validate  check processed PNGs, names, hashes, provenance
  package   zip verified images in batches of <=10 with attribution + report
  report    feasibility numbers for the GO / CONDITIONAL GO / NO-GO gate

Text matching is discovery only. A photo becomes DONE_VERIFIED only after a
human marks it ACCEPT in review.csv AND it passes process + validate.
Standard library + Pillow only. No paid APIs, no database.
"""
from __future__ import annotations

import argparse, csv, hashlib, io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request, zipfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

INDEX_URL = "https://huggingface.co/datasets/carimages/carimages-rights/resolve/main/carimages-rights.csv"
# Wikimedia asks for a descriptive User-Agent with contact details.
USER_AGENT = os.environ.get("AXENTRA_UA", "AxentraImagePipeline/2.0 (contact: set AXENTRA_UA env var)")
CANVAS = (1536, 1024)
MIN_SOURCE_WIDTH = 1000
TOP_N = 8

# ---------------------------------------------------------------- statuses
NO_METADATA_MATCH = "NO_METADATA_MATCH"
LICENCE_UNVERIFIED = "LICENCE_UNVERIFIED"
REJECTED_LICENCE = "REJECTED_LICENCE"
READY_FOR_DOWNLOAD = "READY_FOR_DOWNLOAD"
DOWNLOAD_FAILED = "DOWNLOAD_FAILED"
READY_FOR_VISUAL_REVIEW = "READY_FOR_VISUAL_REVIEW"
REJECTED_VISUAL = "REJECTED_VISUAL"
PROCESS_FAILED = "PROCESS_FAILED"
PROCESSED = "PROCESSED"
VALIDATION_FAILED = "VALIDATION_FAILED"
DONE_VERIFIED = "DONE_VERIFIED"

# ---------------------------------------------------------------- text utils
MAKE_ALIASES = {
    "mercedes-benz": [["mercedes", "benz"], ["mercedes"], ["benz"]],
    "volkswagen": [["volkswagen"], ["vw"]],
    "alfa romeo": [["alfa", "romeo"], ["alfa"]],
    "land rover": [["land", "rover"], ["landrover"]],
    "rolls-royce": [["rolls", "royce"]],
    "aston martin": [["aston", "martin"]],
    "mini": [["mini"]],
    "ds": [["ds"]],
    "mg": [["mg"]],
}
BODY_WORDS = {
    "convertible": {"convertible", "cabrio", "cabriolet", "spider", "spyder", "roadster", "volante", "drophead"},
    "estate": {"estate", "touring", "avant", "kombi", "combi", "wagon", "sportwagon", "sportstourer", "variant", "sw", "shooting"},
    "coupe": {"coupe", "coupé"},
    "saloon": {"saloon", "sedan", "limousine"},
    "hatchback": {"hatchback", "hatch", "3door", "5door"},
    "SUV": {"suv", "crossover"},
    "MPV": {"mpv", "minivan", "van"},
    "van": {"van", "panel"},
    "pickup": {"pickup", "pick", "ute"},
}
# Words that, right after the model token, turn it into a different model
# (Fiat 500 vs 500X / 500L / 500e is handled by tokenising; these cover spaced variants).
VARIANT_SUFFIXES = {"x", "l", "e", "xl", "plus", "picasso", "aircross", "cross", "tourer", "electric"}
YEAR_RE = re.compile(r"(?<!\d)(19[89]\d|20[0-3]\d)(?!\d)")


def tokens(s: str) -> list[str]:
    s = urllib.parse.unquote(s or "").lower()
    s = re.sub(r"\.(jpe?g|png|tiff?|webp|gif)$", "", s)
    return [t for t in re.split(r"[^a-z0-9é]+", s) if t]


def make_variants(make: str) -> list[list[str]]:
    key = make.lower()
    return MAKE_ALIASES.get(key, [tokens(make)])


def find_seq(toks: list[str], seq: list[str]) -> list[int]:
    n = len(seq)
    return [i for i in range(len(toks) - n + 1) if toks[i:i + n] == seq]


@dataclass
class Row:
    illustration_id: str
    make: str
    model: str
    body_type: str
    year_from: int
    year_to: int
    phase: int = 0
    generation: str = ""
    confidence: str = ""


def match_score(row: Row, filename: str) -> tuple[int, list[str]] | None:
    """Return (score, reasons) if filename plausibly shows this make+model, else None.

    Rules: make must appear; model tokens must appear as a contiguous run within
    3 tokens of the make; a variant suffix right after the model rejects it
    (stops 'Fiat 500 L' matching '500'); a year outside the range is rejected.
    """
    toks = tokens(filename)
    model_seq = tokens(row.model)
    if not model_seq:
        return None
    make_hits = []
    for v in make_variants(row.make):
        make_hits += [(i, len(v)) for i in find_seq(toks, v)]
    if not make_hits:
        return None
    model_hits = find_seq(toks, model_seq)
    best = None
    for m in model_hits:
        for mi, ml in make_hits:
            gap = m - (mi + ml) if m >= mi else mi - (m + len(model_seq))
            if gap < 0 or gap > 3:
                continue
            after = toks[m + len(model_seq)] if m + len(model_seq) < len(toks) else ""
            if after in VARIANT_SUFFIXES:
                continue
            if best is None or gap < best:
                best = gap
    if best is None:
        return None
    score, why = 10 - best, [f"make+model gap {best}"]
    years = [int(y) for y in YEAR_RE.findall(urllib.parse.unquote(filename))]
    if years:
        if any(row.year_from <= y <= row.year_to for y in years):
            score += 5; why.append("year in range")
        elif any(row.year_from - 1 <= y <= row.year_to + 1 for y in years):
            score += 1; why.append("year within 1 of range")
        else:
            return None  # explicit year outside range = likely wrong generation
    else:
        why.append("no year in filename")
    body = BODY_WORDS.get(row.body_type, set())
    other = set().union(*(w for k, w in BODY_WORDS.items() if k != row.body_type)) - body
    if body & set(toks):
        score += 3; why.append("body word match")
    elif other & set(toks):
        score -= 4; why.append("other body word")
    return score, why


# ---------------------------------------------------------------- licences
SHARE_ALIKE_POLICY = os.environ.get("AXENTRA_SHAREALIKE", "REVIEW")  # REVIEW | ACCEPT | REJECT


def classify_licence(rec: dict) -> tuple[str, str]:
    """Return (decision, reason). decision in ACCEPT, ACCEPT_SHAREALIKE, REJECT, UNVERIFIED."""
    code = (rec.get("license_code") or "").strip().lower()
    name = (rec.get("license_name") or "").lower()
    url = (rec.get("license_url") or "").strip()
    flag = lambda k: str(rec.get(k, "")).strip().lower()
    if not code:
        return "UNVERIFIED", "no licence code"
    if "nc" in re.split(r"[-_. ]", code) or "noncommercial" in name.replace("-", "").replace(" ", ""):
        return "REJECT", "non-commercial"
    if "nd" in re.split(r"[-_. ]", code) or flag("allows_derivatives") in ("0", "false"):
        return "REJECT", "no derivatives (we resize/crop)"
    if code in ("pd", "cc0", "cc0-1.0", "public-domain", "pdm", "pdm-1.0"):
        return "ACCEPT", "public domain / CC0"
    if not url:
        return "UNVERIFIED", "attribution licence without licence_url"
    if code.startswith("cc-by-sa") or flag("share_alike") in ("1", "true"):
        if SHARE_ALIKE_POLICY == "ACCEPT":
            return "ACCEPT_SHAREALIKE", "CC BY-SA accepted by policy; processed PNG must be shared under same licence"
        if SHARE_ALIKE_POLICY == "REJECT":
            return "REJECT", "CC BY-SA rejected by policy"
        return "ACCEPT_SHAREALIKE", "CC BY-SA: usable if processed PNG is released under BY-SA with attribution (decision pending)"
    if code.startswith("cc-by"):
        return "ACCEPT", "CC BY: attribution required"
    return "UNVERIFIED", f"unrecognised licence {code}"


# ---------------------------------------------------------------- filenames
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9-]+_\d+$")


def valid_output_name(name: str, manifest_ids: set[str]) -> tuple[bool, str]:
    if not name.endswith(".png"):
        return False, "not .png"
    stem = name[:-4]
    if not ID_RE.match(stem):
        return False, "bad id format"
    if stem not in manifest_ids:
        return False, "id not in manifest"
    return True, "ok"


# ---------------------------------------------------------------- io helpers
def read_csv(p: Path) -> list[dict]:
    with p.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_csv(p: Path, rows: list[dict], fields: list[str] | None = None) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    fields = fields or (list(rows[0]) if rows else ["empty"])
    tmp = p.with_suffix(p.suffix + ".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore"); w.writeheader(); w.writerows(rows)
    tmp.replace(p)


def http_get(url: str, timeout: int = 60, retries: int = 4, pause: float = 1.0) -> bytes:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404, 410):
                break
            wait = int(e.headers.get("Retry-After", 0) or 0) or pause * 2 ** attempt
            time.sleep(min(wait, 60))
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e; time.sleep(pause * 2 ** attempt)
    raise RuntimeError(f"GET failed {url}: {last}")


def load_manifest(p: Path, ids=None, phase=None, limit=None) -> list[Row]:
    out = []
    for r in read_csv(p):
        row = Row(r["illustration_id"], r["make"], r["model"], r["body_type"], int(r["year_from"]), int(r["year_to"]),
                  int(r.get("phase") or 0), r.get("generation", ""), r.get("confidence", ""))
        if ids and row.illustration_id not in ids: continue
        if phase and row.phase != phase: continue
        out.append(row)
    return out[:limit] if limit else out


# ---------------------------------------------------------------- stages
def stage_index(a):
    dest = Path(a.work) / "index" / "carimages-rights.csv"
    if dest.exists() and not a.force:
        print(f"index cached: {dest}"); return
    data = http_get(INDEX_URL, timeout=300)
    dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
    rows = read_csv(dest)
    need = {"photo_id", "source_filename", "source_url", "source_page_url", "license_code", "license_url", "credit_text"}
    missing = need - set(rows[0]) if rows else need
    if missing: raise RuntimeError(f"index columns missing: {sorted(missing)}")
    print(f"index saved: {dest} ({len(rows)} rows)")


def stage_match(a):
    work = Path(a.work)
    idx = Path(a.index_file) if a.index_file else work / "index" / "carimages-rights.csv"
    if not idx.exists(): sys.exit(f"missing index {idx}: run `index` first")
    index = read_csv(idx)
    rows = load_manifest(Path(a.manifest), set(a.ids.split(",")) if a.ids else None, a.phase, a.limit)
    # pre-filter by make token to keep it fast
    cands, summary, seen = [], [], set()
    for row in rows:
        mk = {t for v in make_variants(row.make) for t in v}
        found = []
        for rec in index:
            fn = rec.get("source_filename", "")
            if not mk & set(tokens(fn)): continue
            m = match_score(row, fn)
            if not m: continue
            key = (row.illustration_id, rec.get("sha256") or rec.get("photo_id") or rec.get("source_url"))
            if key in seen: continue
            seen.add(key)
            dec, why = classify_licence(rec)
            try: w = int(float(rec.get("width") or 0))
            except ValueError: w = 0
            score = m[0] + (2 if w >= 2000 else 0) - (5 if 0 < w < MIN_SOURCE_WIDTH else 0)
            status = {"ACCEPT": READY_FOR_DOWNLOAD, "ACCEPT_SHAREALIKE": READY_FOR_DOWNLOAD,
                      "REJECT": REJECTED_LICENCE}.get(dec, LICENCE_UNVERIFIED)
            found.append({"illustration_id": row.illustration_id, "make": row.make, "model": row.model,
                          "year_from": row.year_from, "year_to": row.year_to, "body_type": row.body_type,
                          "score": score, "match_reasons": "; ".join(m[1]), "licence_decision": dec,
                          "licence_reason": why, "status": status, **{k: rec.get(k, "") for k in (
                              "photo_id", "sha256", "source_filename", "source_page_url", "source_url", "license_code",
                              "license_url", "creator_name", "credit_text", "width", "height", "dominant_hex")}})
        found.sort(key=lambda r: (r["status"] != READY_FOR_DOWNLOAD, -r["score"]))
        keep = found[:a.top]
        cands += keep
        ok = [c for c in keep if c["status"] == READY_FOR_DOWNLOAD]
        summary.append({"illustration_id": row.illustration_id, "make": row.make, "model": row.model,
                        "years": f"{row.year_from}-{row.year_to}", "body_type": row.body_type,
                        "metadata_matches": len(found), "licence_ok": sum(c["status"] == READY_FOR_DOWNLOAD for c in found),
                        "year_in_range": sum("year in range" in c["match_reasons"] for c in found),
                        "kept": len(keep), "status": READY_FOR_DOWNLOAD if ok else (NO_METADATA_MATCH if not found else keep[0]["status"])})
    write_csv(work / "candidates.csv", cands)
    write_csv(work / "summary.csv", summary)
    print(f"{len(rows)} vehicles, {len(cands)} candidates kept -> {work/'candidates.csv'}, {work/'summary.csv'}")


def stage_download(a):
    work = Path(a.work); cpath = work / "candidates.csv"
    cands = read_csv(cpath); n = 0
    for c in cands:
        if c["status"] not in (READY_FOR_DOWNLOAD, DOWNLOAD_FAILED): continue
        ext = Path(urllib.parse.urlparse(c["source_url"]).path).suffix.lower() or ".jpg"
        dest = work / "originals" / c["illustration_id"] / f"{c['photo_id'] or hashlib.sha1(c['source_url'].encode()).hexdigest()[:12]}{ext}"
        c["local_path"] = str(dest)
        if dest.exists() and dest.stat().st_size > 0:
            c["status"] = READY_FOR_VISUAL_REVIEW; continue
        try:
            data = http_get(c["source_url"], timeout=120)
            if c.get("sha256") and hashlib.sha256(data).hexdigest() != c["sha256"].lower():
                raise RuntimeError("sha256 mismatch with index")
            from PIL import Image
            Image.open(io.BytesIO(data)).verify()
            dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
            c["status"] = READY_FOR_VISUAL_REVIEW; c["download_error"] = ""; n += 1
        except Exception as e:
            c["status"] = DOWNLOAD_FAILED; c["download_error"] = str(e)[:200]
        write_csv(cpath, cands, list(dict.fromkeys([*cands[0], "local_path", "download_error"])))  # resume-safe
        time.sleep(a.delay)
    write_csv(cpath, cands, list(dict.fromkeys([*cands[0], "local_path", "download_error"])))
    print(f"downloaded {n}; statuses: {count(cands)}")


def count(rows, k="status"):
    out = {}
    for r in rows: out[r[k]] = out.get(r[k], 0) + 1
    return out


def stage_sheet(a):
    from PIL import Image, ImageDraw
    work = Path(a.work); cands = read_csv(work / "candidates.csv")
    by = {}
    for c in cands:
        if c["status"] == READY_FOR_VISUAL_REVIEW and c.get("local_path"): by.setdefault(c["illustration_id"], []).append(c)
    review = work / "review.csv"
    existing = {(r["illustration_id"], r["photo_id"]) for r in read_csv(review)} if review.exists() else set()
    rev_rows = read_csv(review) if review.exists() else []
    tw, th, pad = 360, 240, 30
    for iid, cs in by.items():
        sheet = Image.new("RGB", (pad + len(cs) * (tw + pad), th + 3 * pad + 20), "white")
        d = ImageDraw.Draw(sheet)
        d.text((pad, 8), f"{iid} | {cs[0]['make']} {cs[0]['model']} {cs[0]['year_from']}-{cs[0]['year_to']} {cs[0]['body_type']}", fill="black")
        for i, c in enumerate(cs):
            try:
                im = Image.open(c["local_path"]).convert("RGB"); im.thumbnail((tw, th))
                x = pad + i * (tw + pad); sheet.paste(im, (x, 2 * pad))
                d.text((x, 2 * pad + th + 4), f"#{i+1} photo {c['photo_id']} | {c['license_code']} | score {c['score']}", fill="black")
            except Exception as e:
                c["status"] = DOWNLOAD_FAILED
            if (iid, c["photo_id"]) not in existing:
                rev_rows.append({"illustration_id": iid, "candidate_no": i + 1, "photo_id": c["photo_id"],
                                 "source_page_url": c["source_page_url"], "license_code": c["license_code"],
                                 "decision": "", "checked_make_model": "", "checked_generation": "",
                                 "checked_body_type": "", "angle": "", "notes": ""})
        out = work / "contact_sheets" / f"{iid}.jpg"; out.parent.mkdir(parents=True, exist_ok=True); sheet.save(out, quality=88)
    write_csv(review, rev_rows)
    print(f"{len(by)} contact sheets -> {work/'contact_sheets'}; fill decision=ACCEPT/REJECT (+ Y in checked_*) in {review}")


def reviewed_accepts(work: Path) -> list[dict]:
    review = work / "review.csv"
    if not review.exists(): return []
    out, chosen = [], set()
    for r in read_csv(review):
        ok = r.get("decision", "").strip().upper() == "ACCEPT" and all(
            r.get(k, "").strip().upper() in ("Y", "YES") for k in ("checked_make_model", "checked_generation", "checked_body_type"))
        if ok and r["illustration_id"] not in chosen:
            chosen.add(r["illustration_id"]); out.append(r)
    return out


def fit_on_canvas(im, canvas=CANVAS, fill_ratio=0.86):
    """Scale proportionally (never stretch) and centre on white."""
    from PIL import Image
    im = im.convert("RGBA")
    s = min(canvas[0] * fill_ratio / im.width, canvas[1] * fill_ratio / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    bg = Image.new("RGBA", canvas, (255, 255, 255, 255))
    bg.alpha_composite(im, ((canvas[0] - im.width) // 2, (canvas[1] - im.height) // 2))
    return bg.convert("RGB"), s


def stage_process(a):
    from PIL import Image
    work = Path(a.work); cands = {(c["illustration_id"], c["photo_id"]): c for c in read_csv(work / "candidates.csv")}
    prov_path = work / "provenance.csv"
    prov = {r["illustration_id"]: r for r in read_csv(prov_path)} if prov_path.exists() else {}
    try:
        from rembg import remove  # optional, free/local
    except Exception:
        remove = None
    for r in reviewed_accepts(work):
        c = cands.get((r["illustration_id"], r["photo_id"]))
        if not c: continue
        out = work / "processed" / f"{r['illustration_id']}.png"
        try:
            im = Image.open(c["local_path"]); mods = []
            if remove and a.remove_bg:
                im = remove(im); mods.append("background removed (rembg)")
            im, s = fit_on_canvas(im)
            mods.append(f"scaled x{s:.3f} proportionally, padded to {CANVAS[0]}x{CANVAS[1]} white canvas")
            out.parent.mkdir(parents=True, exist_ok=True); im.save(out, "PNG")
            status = PROCESSED
        except Exception as e:
            status, mods = PROCESS_FAILED, [f"error: {e}"]
        prov[r["illustration_id"]] = {
            "illustration_id": r["illustration_id"], "source_url": c["source_url"], "source_page_url": c["source_page_url"],
            "creator": c.get("creator_name", ""), "license_code": c["license_code"], "license_url": c["license_url"],
            "licence_decision": c["licence_decision"], "attribution_text": c.get("credit_text", ""),
            "modifications": "; ".join(mods), "rights_checked": date.today().isoformat(),
            "image_type": "photograph (not a studio render)", "status": status, "output": str(out)}
    write_csv(prov_path, list(prov.values()))
    print(f"processed: {count(list(prov.values()))} -> {work/'processed'}")


def provenance_issues(pr: dict) -> list[str]:
    out = []
    dec = pr.get("licence_decision", "")
    if dec not in ("ACCEPT", "ACCEPT_SHAREALIKE"):
        out.append(f"licence decision {dec or 'missing'}")
    if dec == "ACCEPT_SHAREALIKE" and SHARE_ALIKE_POLICY != "ACCEPT":
        out.append("CC BY-SA but AXENTRA_SHAREALIKE is not ACCEPT (record the decision first)")
    if pr.get("license_code", "").lower() not in ("pd", "cc0", "cc0-1.0") and not pr.get("license_url"):
        out.append("missing licence url")
    if dec != "ACCEPT" or pr.get("license_code", "").lower().startswith("cc-by"):
        if not pr.get("attribution_text") and not pr.get("creator"):
            out.append("attribution required but no credit text")
    if not pr.get("source_page_url"):
        out.append("missing source page")
    return out


def stage_validate(a):
    from PIL import Image
    work = Path(a.work); ids = {r.illustration_id for r in load_manifest(Path(a.manifest))}
    prov = {r["illustration_id"]: r for r in read_csv(work / "provenance.csv")} if (work / "provenance.csv").exists() else {}
    hashes, issues = {}, []
    for p in sorted((work / "processed").glob("*")):
        ok, why = valid_output_name(p.name, ids)
        if not ok: issues.append({"file": p.name, "issue": why}); continue
        try:
            with Image.open(p) as im:
                im.verify()
            with Image.open(p) as im:
                if im.size != CANVAS: issues.append({"file": p.name, "issue": f"size {im.size}"})
                if im.convert("L").getextrema()[0] >= 250: issues.append({"file": p.name, "issue": "image is blank"})
        except Exception as e:
            issues.append({"file": p.name, "issue": f"decode error {e}"}); continue
        h = hashlib.sha256(p.read_bytes()).hexdigest()
        if h in hashes: issues.append({"file": p.name, "issue": f"duplicate of {hashes[h]}"})
        hashes[h] = p.name
        pr = prov.get(p.stem)
        if not pr: issues.append({"file": p.name, "issue": "no provenance"})
        else:
            issues += [{"file": p.name, "issue": i} for i in provenance_issues(pr)]
    for iid, pr in prov.items():
        if not Path(pr["output"]).exists(): issues.append({"file": f"{iid}.png", "issue": "missing asset"})
    bad = {i["file"] for i in issues}
    for iid, pr in prov.items():
        if pr["status"] in (PROCESSED, DONE_VERIFIED, VALIDATION_FAILED):
            pr["status"] = VALIDATION_FAILED if f"{iid}.png" in bad else DONE_VERIFIED
    if prov: write_csv(work / "provenance.csv", list(prov.values()))
    write_csv(work / "validation_issues.csv", issues, ["file", "issue"])
    print(f"validated {len(hashes)} files, {len(issues)} issues -> {work/'validation_issues.csv'}")
    return issues


def stage_package(a):
    work = Path(a.work)
    prov = [r for r in read_csv(work / "provenance.csv") if r["status"] == DONE_VERIFIED] if (work / "provenance.csv").exists() else []
    out_dir = work / "batches"; out_dir.mkdir(exist_ok=True)
    for b in range(0, len(prov), 10):
        batch = prov[b:b + 10]; n = b // 10 + 1
        label = "" if len(batch) == 10 else f"_PARTIAL_{len(batch)}of10"
        zp = out_dir / f"axentra_images_batch_{n:03d}{label}.zip"
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            for r in batch: z.write(r["output"], Path(r["output"]).name)
            att = "\n".join(f"{r['illustration_id']}.png: {r['attribution_text'] or 'No attribution required'} | {r['license_code']} {r['license_url']} | source {r['source_page_url']} | {r['modifications']}" for r in batch)
            z.writestr("ATTRIBUTION.txt", att + "\n")
            z.writestr("report.json", json.dumps({"batch": n, "complete": len(batch) == 10, "count": len(batch), "items": batch}, indent=2))
        print(zp)
    if not prov: print("no DONE_VERIFIED images: nothing packaged")


def stage_report(a):
    work = Path(a.work)
    s = read_csv(work / "summary.csv") if (work / "summary.csv").exists() else []
    c = read_csv(work / "candidates.csv") if (work / "candidates.csv").exists() else []
    rv = read_csv(work / "review.csv") if (work / "review.csv").exists() else []
    pv = read_csv(work / "provenance.csv") if (work / "provenance.csv").exists() else []
    ids = [r["illustration_id"] for r in s]
    has = lambda pred: len({x["illustration_id"] for x in c if pred(x)})
    rep = {
        "vehicles_searched": len(ids),
        "with_metadata_matches": sum(int(r["metadata_matches"]) > 0 for r in s),
        "with_suitable_licence": sum(int(r["licence_ok"]) > 0 for r in s),
        "with_accessible_photo": has(lambda x: x["status"] in (READY_FOR_VISUAL_REVIEW,)),
        "with_year_in_range_filename": sum(int(r["year_in_range"]) > 0 for r in s),
        "human_confirmed_generation": len({r["illustration_id"] for r in rv if r.get("checked_generation", "").upper() in ("Y", "YES")}),
        "accepted_in_review": len({r["illustration_id"] for r in reviewed_accepts(work)}),
        "processed_and_verified": sum(r["status"] == DONE_VERIFIED for r in pv),
        "awaiting_human_review": len({r["illustration_id"] for r in rv if not r.get("decision")}),
        "no_usable_source": [r["illustration_id"] for r in s if int(r["licence_ok"]) == 0],
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (work / "feasibility_report.json").write_text(json.dumps(rep, indent=2))
    print(json.dumps(rep, indent=2))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("stage", choices=["index", "match", "download", "sheet", "process", "validate", "package", "report"])
    p.add_argument("--manifest", default="axentra_manifest.csv")
    p.add_argument("--work", default="pipeline_out")
    p.add_argument("--index-file", help="use a local copy of carimages-rights.csv")
    p.add_argument("--ids", help="comma-separated illustration_ids")
    p.add_argument("--phase", type=int)
    p.add_argument("--limit", type=int)
    p.add_argument("--top", type=int, default=TOP_N)
    p.add_argument("--delay", type=float, default=1.0, help="seconds between downloads")
    p.add_argument("--remove-bg", action="store_true", help="use rembg if installed")
    p.add_argument("--force", action="store_true")
    a = p.parse_args(argv)
    t0 = time.time()
    globals()[f"stage_{a.stage}"](a)
    print(f"[{a.stage}] {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
