# Axentra transactional email identity audit — 25 November 2026

Audited production Edge Function source: send-invoice-email v20, send-pod-email v32, notify-customers v26, request-password-reset v28, portal-access v25, user-lifecycle v82. Repository searches covered Resend sends, auth invite/reset calls, and mailto references. Existing live branding was split among invoice light, POD/action navy, and status notification legacy styles.

## Standard

The approved invoice light design is the reference: shared header (existing /axentra-logo.png + AXENTRA / VEHICLE LOGISTICS wordmark), white surface, #F4F7FA outer background, #172F52 ink, #576B85 muted, #D4E2F0 border, #2B7DC9 accent, 480px responsive container. Invoice keeps its pale amount card and both download buttons. Preserve event-specific copy, dates, contacts, signed links, recipients, expiry and triggers. POD/status emails for non-Axentra operators preserve their own configured brand identity. No financial logic or schema change.

## Coverage and limits

- Invoice and invoice-pack email (including existing credit-note send route)
- Proof of collection and proof of delivery (same renderer)
- Collected, delivered, aborted customer status notifications
- Staff/driver/subcontractor invitation and re-invitation, customer portal invitation and re-invitation, password recovery (shared action renderer)
- Native Supabase Auth fallback invite/reset emails remain a separate path when Resend is not configured. Hosted Auth template/SMTP configuration was not accessible in the available project API. Verify these directly in the dashboard; do not remove a working recovery fallback just for branding.
- Device mailto/share fallbacks and manually sent emails are not server-generated HTML; no universal control over their appearance. External platform mail is outside this repository.
- Sender addresses are configured by environment variables. Display names and delivered From/Reply-To must be verified through a test mailbox rather than inferred from code or exposed secrets.

## Release

Verify tests/typecheck and actual rendered inbox messages (Apple Mail and Gmail, desktop/mobile, light/dark and image blocking). Use synthetic recipient/test data only. Deploy all six email Edge Functions with their shared dependencies together; confirm source versions and image accessibility. No Vercel deployment or database migration required for the email-template-only change. Keep existing JWT settings and permissions. Do not send real customer messages for QA.
