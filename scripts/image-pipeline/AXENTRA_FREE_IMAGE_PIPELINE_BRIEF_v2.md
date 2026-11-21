# AXENTRA — FREE VEHICLE IMAGE PIPELINE (brief v2)

Claude Code | Principal Engineer | Truthmode | Execution Mode

## Mission

Prove, with the first 10 vehicles, whether free and commercially reusable photographs can supply Axentra's vehicle body-shape images. The full target is **1,485 images across 24 phases** (the cleaned manifest). Do not scale past the pilot without evidence.

## Inputs in this folder

| File | What it is |
|---|---|
| `axentra_manifest.csv` | 1,485 rows: `illustration_id, phase, make, model, body_type, year_from, year_to, generation, confidence`. The first 10 rows of phase 1 are the pilot. |
| `axentra_image_pipeline.py` | Repaired pipeline. **Replaces** `axentra_free_image_audit.py` (keep the old file, don't run it). |
| `test_axentra_image_pipeline.py` | 22 unit and offline end-to-end tests. |

Labels such as "Shape 1" in `generation` are internal placeholders. Ignore them and go by make, model and years.

## Decisions already made (do not change without asking Terrence)

1. **Angle: side profile, car facing left.** This matches the ChatGPT illustration set, so the library stays consistent. Accept a front three-quarter photo only if no usable side profile exists, and flag it `ANGLE_EXCEPTION` in `review.csv` notes. Do not flip a photo to face left if badges, text, a number plate or asymmetric features (fuel flap, exhaust, steering side) would end up reversed. Reject the photo instead.
2. **CC BY-SA is not auto-rejected.** The pipeline keeps BY-SA as `ACCEPT_SHAREALIKE`, but validation blocks BY-SA images from packaging until `AXENTRA_SHAREALIKE=ACCEPT` is set. Before setting it, write down in the report whether Axentra can release each processed PNG under the same BY-SA licence, with attribution, in the places the app shows it. If unclear, leave it unset and report the count.
3. **Non-commercial (NC) and no-derivatives (ND) licences are rejected.** Missing or unknown licences become `LICENCE_UNVERIFIED`.
4. **Photos are photos.** Provenance records each one as `photograph (not a studio render)`. Never describe a background-removed photo as a render.

## Verified facts about the source (checked 21 Nov 2026 via the Hugging Face pages)

- `carimages/carimages-rights` exists: 83,134 rows, metadata and URLs only, no images. Photos come from Wikimedia Commons.
- `carimages-rights.csv` is at the repo root (about 57 MB). The URL in the script is correct.
- Columns include `photo_id, sha256, source_page_url, source_url, source_filename, license_code, license_url, share_alike, allows_derivatives, creator_name, credit_text, width, height`.
- Licence mix: about 17k CC0/PD, 21k CC BY, 45k CC BY-SA. The old script dropped all BY-SA (more than half the dataset), which is a likely reason it found little.
- The dataset's CC0 covers the metadata only. Each photo has its own licence, and `license_url` is the authority. Re-check the Commons file page for every accepted photo.

Re-run these checks yourself. Do not trust this brief over live data.

## What changed from the old script

- Reads the manifest instead of 10 hard-coded rows (`--limit`, `--phase`, `--ids`).
- Matching on tokens: the make (with aliases such as VW and Mercedes) must appear within 3 tokens of the full model name. "500" no longer matches "5000", "500X" or "Fiat 500 L". A year in the filename outside the range rejects the candidate, and body words adjust the score.
- Licence classification as above. Candidates are de-duplicated by sha256/photo_id.
- HTTP retries with backoff, `Retry-After`, timeouts, a 1 s delay between downloads, and a descriptive User-Agent (Wikimedia requires one).
- Downloads are checked against the index sha256 and decoded with Pillow. Originals go in `originals/<id>/`, kept separate from `processed/`.
- Every stage is resumable and writes its CSVs atomically.
- Contact sheets plus `review.csv`. Human review is the visual gate.
- Processing scales proportionally onto a white 1536×1024 canvas and never stretches. Background removal runs only if `rembg` is installed and `--remove-bg` is passed.
- Validation checks PNG decoding, size, blank images, exact filename, manifest ID, duplicate hashes, provenance, licence and attribution. Only images that pass become `DONE_VERIFIED`.
- Packaging builds ZIPs of up to 10 with `ATTRIBUTION.txt` and `report.json`. A batch with fewer than 10 is named `_PARTIAL_NofM`.

## Run order

```bash
git checkout -b feature/free-image-pilot
export AXENTRA_UA="AxentraImagePipeline/2.0 (contact: <your email>)"
python3 -m unittest -v test_axentra_image_pipeline      # must pass first
P="python3 axentra_image_pipeline.py --manifest axentra_manifest.csv --work pipeline_out"
$P index
$P match --phase 1 --limit 10
$P download
$P sheet          # contact sheets -> pipeline_out/contact_sheets/
```

**Stop here for human review.** Open each contact sheet and fill in `pipeline_out/review.csv`:
- `decision` = ACCEPT or REJECT. ACCEPT at most one candidate per vehicle.
- `checked_make_model`, `checked_generation` and `checked_body_type` = Y only if you confirmed each one by looking at the photo and its Commons page.
- `angle`, and anything else in `notes`.

If Claude is doing the review, it must open each original image file and the Commons page. Filename text is not verification. If it can't see the image, leave the decision blank and report `READY_FOR_VISUAL_REVIEW`.

```bash
$P process        # add --remove-bg only if rembg is installed and results are checked
$P validate
$P package
$P report         # -> pipeline_out/feasibility_report.json
```

Look at every processed PNG before packaging. Reject any with a poor cut-out, a cropped car or a reversed badge.

## Statuses

`NO_METADATA_MATCH`, `LICENCE_UNVERIFIED`, `REJECTED_LICENCE`, `READY_FOR_DOWNLOAD`, `DOWNLOAD_FAILED`, `READY_FOR_VISUAL_REVIEW`, `REJECTED_VISUAL`, `PROCESSED`, `VALIDATION_FAILED`, `DONE_VERIFIED`.

`DONE_VERIFIED` is only set by `validate`, for a photo a human accepted with all three checks marked Y.

## Feasibility gate (after the 10)

Report: vehicles searched; with metadata matches; with a suitable licence; with an accessible photo; with a filename year in range; human-confirmed generation; accepted; processed and verified; awaiting review; with no usable source; and actual time per stage (each stage prints its time).

Then recommend one of:
- **GO:** at least 8 of 10 verified with a consistent side-profile look.
- **CONDITIONAL GO:** 5 to 7 of 10, or only with angle exceptions, BY-SA acceptance or extra sources. Name the compromise.
- **NO-GO:** fewer than 5 of 10, or the results look too inconsistent beside the illustrations.

The pilot rows include 2026 Chinese EVs (Aion UT and V) and niche models (Aiways). Expect gaps there, and report them rather than filling them.

If the result is NO-GO or CONDITIONAL GO, say whether Wikimedia Commons category search (`Category:<Make> <Model>`) would close the gaps. Test it on the failed rows before recommending it. Do not build it before the gate.

## Safeguards (unchanged)

- Work on a separate branch. Don't change app logic, Supabase or existing image assets.
- Don't delete user files, make paid API calls or expose credentials.
- Don't commit originals or large datasets. Add `pipeline_out/` to `.gitignore`.
- Ask before anything that costs money, touches production or is destructive.
- Never invent images, coverage figures, licences, test results or paths. Separate completed work from incomplete work in the final report.

## Final deliverables

Pipeline and test results (actual output), `feasibility_report.json`, contact sheets, processed PNGs and ZIPs (if any), `provenance.csv`, the missing/rejected list (`summary.csv` and `validation_issues.csv`), exact output paths, and the GO / CONDITIONAL GO / NO-GO recommendation.
