# Axentra approved UK plate — deployment gate

Status: PR review. **Both approved PNGs are committed with matching hashes. Do not merge until all required checks and preview QA pass.**

The code uses the exact approved yellow number plate (blue EU stars/UK band). The plate artwork is not regenerated. The original must stay byte-for-byte identical. The renderer supplies live vehicle registrations and scales with the parent layout.

## Required images (committed and integrity checked)

Both assets were transferred losslessly from the user-approved ZIP and committed in this feature branch:

- public/assets/axentra-uk-plate-original-4k.png — source 3840x2160 PNG, SHA256: 9bcb5ec96204510a1c7e06a26631b83c1a9404913b12a85dfd72e9e66ad24d2e
- public/assets/axentra-uk-plate.png — transparent lossless 3411x672 display asset

Verified Git blob SHA-1: original `cc10c00948b173758954e840d77fd510517186c6`, display `9bc078318253666e012dfdc0ac424224d67c7cfb`. The release test checks for both files and the SHA-256 of the unmodified master.

## Acceptance checklist

1. Verify npm run typecheck and npm test, including src/test/uk-plate.test.tsx.
2. Verify npm run build and the repository's required PR checks.
3. Inspect actual UI at 320, 375, 390, 768 and 1280 CSS pixels: My Jobs, Job Detail, Admin, Control, POD, inspection review and client portal.
4. Confirm original approved image unchanged; dynamic registration uses seven reference-matched SVG character slots.
5. Check older/private registration formats and missing values for safe presentation.
6. Ensure no clipped plate, overlapping status text, missing image, or distortion.
7. Merge only after all checks pass; confirm Vercel production deployment and inspect the live URL.

This change is presentation-only. No database migrations, service changes, job state modifications or invoice workflow changes.
