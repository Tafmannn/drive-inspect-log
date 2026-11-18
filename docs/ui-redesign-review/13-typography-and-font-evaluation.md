# Typography and font evaluation: system fonts vs self-hosted Inter

**Not installed.** No font package was added to the application. The comparison page (`mockups/v2/10-font-comparison.html`, screenshot `screenshots/proposed-v2/v2-10-font-comparison.png`) loads fonts from the Google Fonts CDN at view time for review only. Measurements: `tools/font-measure.cjs` → `screenshots/font-measure.json`.

## What the app does today (measured, not assumed)
No `font-family`, web font or font package exists in `index.css`, `App.css`, `tailwind.config.ts`, `index.html` or `package.json`. Text therefore renders in each device's system font (Tailwind default `font-sans` → `ui-sans-serif, system-ui, …`): SF Pro on iPhone/Mac, Roboto on most Android, Segoe UI on Windows. **This review container resolves `system-ui` to Inter**, so every current-state screenshot shows Inter, *not* what drivers see. That makes the current UI look more uniform than it is, and it means the first-pass "Inter is already in use" assumption was wrong (corrected in `02-ui-audit.md`).

## What can and cannot be compared here
| Font | In this comparison | Represents | Limitation |
|---|---|---|---|
| Inter (web) | yes | the proposed self-hosted option | — |
| Roboto (web) | yes | Android system font | close stand-in |
| Arimo (web, Arial-metric) | yes | Windows/macOS Helvetica/Arial-class fallback | stand-in, not Segoe UI |
| DejaVu Sans | yes | generic Linux fallback, worst case | not a real user environment |
| **SF Pro, Segoe UI** | **no** | iPhone/Mac and Windows system fonts | **not available or licensed here; not shown and not measured** |

## Measured results (13px unless noted, relative to Inter = 100%)
| String | Roboto | Arimo | DejaVu Sans |
|---|---|---|---|
| "Newcastle-under-Lyme → Stratford-upon-Avon" | 92% | 93% | 102% |
| "Llanfairpwllgwyngyll → Aberystwyth" | 93% | 92% | 104% |
| "AX-10482" (600) | 92% | 92% | 110% |
| "IN PROGRESS" (600) | 95% | 104% | 114% |
| "Northgate Motors Remarketing & Fleet Services" | 94% | 94% | 106% |
| Sentence ("Collect from Unit 14, Example Park…") | 94% | 96% | 107% |

**Inter is about 6–8% wider than Roboto and Arial-class fonts.** In the already-tight job tables this means more wrapping and truncation than an Android/Windows device shows today, and the prototypes (drawn in Inter) are therefore slightly *pessimistic* for Android and Windows users and roughly representative for iPhone users (SF Pro is similar in width to Inter, but that was not measured).

**Number alignment** — widths of three same-length amounts ("£1,111.11", "£8,888.88", "£1,000.00"):
| Font | Default behaviour | With `tabular-nums` |
|---|---|---|
| Inter | digits are **proportional**: widths 48.4 / 67.3 / 65.4 px (spread **18.9px**) | 70.5 / 70.5 / 70.5 (spread 0) |
| Roboto | proportional when forced; spread 12.3px | spread 0 |
| Arimo | digits already near-tabular (spread 3.1px) | 3.1 |
| DejaVu Sans | already tabular (0) | 0 |

Takeaway: adopting Inter **requires** `font-variant-numeric: tabular-nums` on every ID, count, money and time column, otherwise numbers jitter. This is already in the v2 spec. Whether SF Pro/Segoe UI default digits are tabular was **not measured**; `tabular-nums` should be applied regardless of font choice.

**x-height / H-height ratio:** Inter 0.753, Roboto 0.736, Arimo 0.768, DejaVu 0.753 — no meaningful legibility difference between them; ambiguous glyphs ("Il1 O0 rn m") were looked at in the render; nothing obviously illegible, but this is an eyeball check, not a rigorous legibility test.

**Payload:** Inter variable Latin subset from the CDN was **47.1 KB** (woff2) in this run; the other fonts' files in the same run were 19.7–42.1 KB each (file-to-font mapping not recorded). A self-hosted Inter would be about that size per used subset (not measured self-hosted). Layout shift (CLS) and load-time effects were **not** measured.

## Options
| Option | Pros | Cons | Risk |
|---|---|---|---|
| **S. Keep system fonts + design tokens + `tabular-nums`** | no dependency, zero payload, native feel, text no wider than today | typography varies by device (documented), prototypes differ by up to ~8% in width on Android/Windows, no guaranteed numeral style | lowest |
| **I. Self-hosted Inter** (variable, Latin subset, `font-display:swap`, `size-adjust` fallback) | consistent look and numerals on every device; matches the prototypes; good small-size legibility | new dependency (needs approval); ~47 KB; ~7% wider than Roboto/Arial → more wrapping in tables; FOUT/CLS to manage; extra asset to maintain | low–medium |

## Recommendation
Ship **Option S inside Phase 1** (tokens, sizes, `tabular-nums`, status badges) because it fixes the measured problems (contrast, sub-12px text, numeral alignment) with no dependency. Treat Inter as a **separate, approval-gated Phase 1b** to be decided *after* checking real iPhone and Android devices (which this review could not do) and after measuring CLS and table wrapping on populated screens. If Inter is approved: self-host the variable Latin subset, preload one file, set `font-display: swap` with a `size-adjust`-tuned fallback, and re-run `tools/layout-check.cjs` at the real widths because tables will tighten by ~7% on Android and Windows.

## Type scale (unchanged by the font decision)
Display 28/32 · H1 24/32 · H2 18/24 · card title 14/20 · body 14/20 (mobile inputs 16/24) · label 13/18 semibold · caption **12/16 (floor)**; weights 400/500/600/650. The scale and the 12px floor apply under either option.
