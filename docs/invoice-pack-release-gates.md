# Invoice pack V1 release gates

Deploy and verify both `portal-evidence` and `send-invoice-email` in staging before enabling the frontend. No database migration is required. The frontend checks both endpoint versions before preparing a new invoice. Private `invoice-pdfs` storage is reused; verify it accepts ZIP as well as PDF and that its size limit accommodates representative packs. No public bucket or receipt-table access is granted.

## Required staging acceptance

- Prepare an invoice with VAT off and multiple original receipt files, including a PDF receipt. Verify the ZIP includes exactly one financial PDF, the receipts and each completed job's POD, and no empty folders; compare standalone PDF and ZIP PDF byte-for-byte after issue.
- Test VAT on: Schedule A remains, references match receipt filenames, amounts and VAT unchanged, no receipt image pages.
- Test aborted job: approved abort amount unchanged; no fabricated POD.
- Test missing, failed, zero-byte receipts and inconsistent expense totals: issue/email fails before publication. Verify failed uploads do not issue the invoice. Verify a prepared pack is reused on retry.
- Verify current-run POD content and signature/photo completeness, including large packs and mobile memory limits.
- Email to a staging recipient: PDF and ZIP links both work; resend uses the same files; expired links fail; provider failure does not show success.
- Two portal clients and an admin: own invoice pack works, other-client invoice ID denied, draft and test invoice denied, malformed IDs and paths denied. Confirm customer cannot directly access private receipt/POD buckets or another client's ZIP.
- Historical issued invoices: existing PDF unchanged, no pack button unless previously pack-backed, legacy email/download unchanged. Test credit notes and payment/cancellation flows.
- Run type check, build, invoice-related tests and the full regression suite. Confirm approval before production deployment.

## Rollback

Do not delete or overwrite any issued files. Keep the pack-aware edge endpoints and portal access working for invoices already issued with pack paths. If reverting frontend issuance, ensure the previous frontend cannot replace existing prepared/issued pack paths; retain access to previously issued packs. No storage policy change is needed. Signed email URLs are bearer links and remain valid for their existing 30-day lifetime; the portal generates short-lived links only after ownership validation.
