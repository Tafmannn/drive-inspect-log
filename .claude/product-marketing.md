# Axentra — sales context (read by the `prospecting` skill)

Facts below are from the codebase/database as of 2026-11-19. Lines marked TO CONFIRM need the owner.

- **What we sell:** UK vehicle movements by trade-plate drivers (collection → delivery), with
  photographed collection/delivery inspections, signed proof of collection/delivery (POC/POD)
  PDFs emailed to the customer, damage recording, and a customer portal for job status,
  evidence and invoices.
- **Scale:** 5 driver profiles; small operator. Do not imply fleet-scale capacity.
- **Current customers:** platform work (Movex, Revilo/Revillo Automotive) plus a few direct clients.
- **Ideal customers (owner brief):** franchised and independent dealerships, dealer groups,
  vehicle sourcing companies, leasing/fleet operators, remarketing companies, auctions,
  logistics brokers. Prefer repeat local-to-regional work over one-offs.
- **Use the B2B and Local SMB branches.** Not SaaS.
- **Prospect from free, public sources only** (company websites, Companies House, Google search,
  trade directories). No paid data tools (Apollo, Clay, ZoomInfo, Hunter …) without an approved
  monthly cost. No LinkedIn scraping.
- **UK PECR:** limited companies/LLPs may be emailed at work addresses with identification and
  an opt-out; sole traders and partnerships need consent. Check entity type on Companies House first.
- **Nothing is sent by Claude.** Output is a list and drafts; the owner approves and sends.
- Pricing / minimum charge / rate per mile: TO CONFIRM (app defaults exist in `app_settings.pricing_defaults`).
- Insurance cover limits and trade-plate details to quote to prospects: TO CONFIRM.
