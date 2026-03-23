

## Make Banner Match Template 1:1 with Uploaded Logos

### What the template shows

The template banner has a dark background with the Axentra logo icon (blue hexagon + grey swooshes) rendered large and centered, with "AXENTRA" text below the icon, and "PRECISION IN EVERY MOVE" tagline beneath that. The dark-background uploaded image (`2F3CD4B1-...-6.png`) already contains this exact composition.

### Problem

The dark-background logo has a black (#000000) background. The banner uses navy (#111D3A). Placing the image directly would show a visible black rectangle. We need to recolor the black background pixels to navy at render time.

### Plan

**1. Create two logo assets**

- `public/axentra-logo-dark.png` from `user-uploads://2F3CD4B1-F124-402F-9602-F19140740486-6.png` (dark bg, for banner)
- `public/axentra-logo-color.png` from `user-uploads://Axentra_Logo_Resized_Under1000px-2.jpeg` (white bg, for other uses)

**2. Update `src/lib/invoicePdf.ts` — banner overhaul**

- Change `LOGO_URL` to point to the dark-background logo asset
- Add a `recolorBackground()` helper that:
  - Draws the loaded image onto an offscreen `<canvas>`
  - Iterates pixel data, replacing near-black pixels (R<35, G<35, B<35) with the navy color (17, 29, 58)
  - Exports the canvas as a PNG data URL
  - This makes the logo's black background match the banner navy seamlessly
- Update `drawHeaderBanner()`:
  - Remove the manually drawn "AXENTRA" / "VEHICLES" / tagline text (the logo image already contains all of this)
  - Render the recolored logo large on the left side (~60mm wide, vertically centered)
  - Keep "INVOICE" title and invoice number on the right side
  - Result: the logo visually merges into the navy banner with no borders

**3. Generate sample PDF for preview**

After implementation, generate a sample invoice PDF to `/mnt/documents/` for visual comparison.

### Files changed

| File | Change |
|------|--------|
| `public/axentra-logo-dark.png` | New asset (dark bg logo) |
| `public/axentra-logo-color.png` | New asset (color logo) |
| `src/lib/invoicePdf.ts` | Recolor helper + banner redesign using full logo image |

### Technical detail

The `recolorBackground` function uses a canvas-based pixel manipulation approach:
```text
loadImg(url) → draw to canvas → getImageData → 
for each pixel: if R<35 && G<35 && B<35 → set to (17,29,58) →
putImageData → canvas.toDataURL("image/png")
```

This avoids any need to regenerate or redesign the logo — it simply makes the existing black background match the navy banner color at render time.

