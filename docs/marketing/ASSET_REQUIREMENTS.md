# Axentra marketing site — assets & configuration to finalise before launch

The public marketing site (`src/features/marketing/`) ships with brand-native
graphical compositions (SVG route motifs, gradient panels, interface previews
built from real UI primitives with **safe sample data only**). It does **not**
use stock or fabricated photography. This document lists what a human should
supply or verify before going live.

## 1. Verify placeholder contact details

In `src/features/marketing/content/marketingContent.ts` (`SITE`):

| Field | Current placeholder | Action |
| --- | --- | --- |
| `origin` | `https://axentravehicles.co.uk` | Confirm the production domain; also update `public/robots.txt` and `public/sitemap.xml`. |
| `contactEmail` | `enquiries@axentravehicles.co.uk` | Replace with the verified enquiries inbox. |
| Telephone | *(intentionally omitted)* | Add a verified number only if one exists — do not invent one. |

No phone number is shown anywhere until a real one is confirmed. No insurance
limits, statistics, client logos or testimonials appear — add only verified ones.

## 2. Photography (in place — review before launch)

The site now uses supplied brand imagery, cropped from the collages and colour-
graded for consistency, in `public/img/`:

| File | Used on | Source |
| --- | --- | --- |
| `hero.jpg` | Homepage hero | Team + fleet outside premises |
| `evidence.jpg` | Homepage evidence section | Driver capturing condition photos |
| `operations.jpg` | Homepage technology section | Coordinator at workstation |
| `team.jpg` | Homepage about + About page hero | Branded team studio shot |
| `handover.jpg` | Services page hero | Key handover with tablet |
| `reception.jpg` | Technology page hero | Operations desk + Axentra logo |

**These are AI-generated placeholders.** Before public launch, review each for:
- **Text artifacts** — some backgrounds/apparel show warped lettering. Ideally
  replace with real photography of actual Axentra operations.
- **Vehicle badges** — frames showing recognisable manufacturer badges were
  deliberately excluded; re-check any replacements for third-party trademarks.
- **UK context** — for a UK audience, prefer RHD vehicles and UK number plates
  (white front / yellow rear) in final photography.

Keep assets local under `public/` (no remote stock URLs in components) and avoid
transporter-lorry imagery — Axentra provides **driven** movements only.

## 3. Open Graph image

`public/og/axentra-home.png` (1200×630) is a branded, generated placeholder.
Replace with final art if desired; keep the 1200×630 size and the
`/og/axentra-home.png` path referenced in `usePageMeta.ts`.

## 4. Edge-function secrets (Supabase → Functions → Secrets)

The enquiry forms post to two edge functions. They persist to RLS-locked tables
regardless, but email sending requires Resend secrets. Set these in Supabase (they
are **server-side secrets — never** put them in the frontend `.env`):

| Secret | Purpose | Required? |
| --- | --- | --- |
| `RESEND_API_KEY` | Sends lead + acknowledgement emails via Resend | Optional — without it, enquiries still save and return a reference; email is skipped (no fake success). |
| `MARKETING_EMAIL_FROM` | From address (falls back to `POD_EMAIL_FROM`, then `onboarding@resend.dev`) | Optional |
| `MARKETING_LEAD_NOTIFY_TO` | Internal address that receives new-lead notifications | Recommended |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to edge functions by
the platform automatically.

Deploy the functions and migration:

```
supabase db push                              # applies 20260714210000_marketing_enquiry_tables.sql
supabase functions deploy submit-movement-request
```

## 5. Legal review

`/privacy`, `/terms`, `/cookies` are honest working **drafts** and are labelled in
the UI as requiring review. Have them reviewed and approved by a qualified legal
professional before relying on them.

## 6. Analytics (optional)

`useMarketingAnalytics` is a privacy-safe no-op by default and never logs PII.
To capture events, register a sink at `window.__axentraAnalytics = (event, props) => {…}`.
