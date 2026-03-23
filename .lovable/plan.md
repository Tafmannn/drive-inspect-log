

## Enlarge Banner Logo to Match Template 1:1

### Current State
- Banner height: `38mm`, logo max width: `80mm`, vertical padding: `3mm` each side
- Logo appears too small compared to the template reference

### What the Template Shows
The template has a generous navy banner where the logo (icon + "AXENTRA VEHICLES" + tagline) occupies roughly 50% of the banner width and fills most of the vertical space. The banner is slightly taller than current.

### Changes — `src/lib/invoicePdf.ts`

**`drawHeaderBanner()` adjustments only:**

| Parameter | Current | New | Reason |
|-----------|---------|-----|--------|
| `bannerH` | 38 | 44 | Match template's taller banner proportion |
| `padY` | 3 | 2 | Less vertical padding = logo fills more height |
| `maxLogoW` | 80 | 110 | Allow logo to spread wider, matching template |
| Logo Y centering | unchanged | unchanged | Already centered |

No other files or sections change. The recolor logic, meta boxes, table, totals, and payment sections remain untouched.

### Technical Detail
In `drawHeaderBanner`, lines ~190-232:
- Change `bannerH` from `38` to `44`
- Change `padY` from `3` to `2`  
- Change `maxLogoW` from `80` to `110`

These three constant tweaks scale the logo to fill the banner like the template.

