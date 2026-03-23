

## Fix Invoice PDF: Correct Logo + Polish Layout + Multi-Row Support

### Problems identified from the current PDF output

1. **Wrong/broken logo** — the logo rendered in the navy header is tiny and distorted (appears as a small unreadable thumbnail). The uploaded Axentra logo needs to replace `public/axentra-logo-white.png`.
2. **Logo too small** — `maxW=38, maxH=22` makes it a postage stamp. Should be ~44x30mm.
3. **Description text garbled** — long descriptions with arrow characters (`→`) render as `!'` in Helvetica. The `buildInvoiceData()` in InvoiceGenerator.tsx uses `→` which jsPDF's Helvetica cannot render.
4. **Multi-row page breaks** — when many line items exist, no explicit handling ensures the table + totals + payment info flow across pages cleanly. `autoTable` handles this natively but the totals/payment sections after need `ensureSpace` (already present but needs verification).

### Changes

**File: `public/axentra-logo-white.png`** — replace with user-uploaded logo via `create_asset` + reference in code. Since the logo has a dark background, it sits perfectly on the navy banner.

**File: `src/lib/invoicePdf.ts`** — targeted fixes:

1. **Logo sizing** — increase `maxW` to 44, `maxH` to 30, and vertically center in the banner
2. **Logo URL** — reference the asset URL from the `.asset.json` pointer instead of `/axentra-logo-white.png`
3. **Arrow character fix** — in `drawHeaderBanner` and `buildChargesTable`, no change needed in the PDF generator itself; the fix goes in `InvoiceGenerator.tsx` where `→` is used in the description string — replace with `->` or `-`
4. **Table page-break** — `autoTable` already handles page breaks for rows. Add `showHead: 'everyPage'` to ensure header repeats on overflow pages.
5. **Post-table sections** — `ensureSpace` calls already guard payment info and notes. Increase the guard for payment info from 40mm to 50mm to account for the full block.

**File: `src/pages/InvoiceGenerator.tsx`** — one-line fix:
- Line 170: replace `→` with `->` in the route description string to avoid glyph issues in the PDF

### Technical details

- The uploaded logo (`2F3CD4B1-...png`) will be created as an asset via `create_asset` at `public/axentra-logo-white.png`
- The asset URL from the `.asset.json` will be used as the default logo URL in the generator
- `autoTable`'s built-in pagination already splits rows across pages; adding `showHead: 'everyPage'` ensures column headers repeat
- No structural changes to the section flow or data contract

