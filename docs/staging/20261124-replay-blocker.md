# Repository schema-replay blocker — 24 November 2026

The first GitHub Actions run in PR #189 launched a disposable Supabase local database and began applying the checked-in 120 migration files.

**BLOCKED:** migration `20260317122123_5dc1e1a5-64ea-47d3-b54e-025e662a8f6e.sql` attempts `ALTER TABLE public.driver_profiles` before `public.driver_profiles` exists in a new database. PostgreSQL reports SQLSTATE `42P01`.

Root cause category: **missing faithful base schema / incomplete historical bootstrap**, not a Free-plan limitation.

Do NOT create a guessed placeholder driver_profiles table, edit historical migrations applied in production, or suppress the failing CI check. The safe repair is to export and independently verify a production-compatible schema-only baseline with authorised database export credentials, reconcile creation order and replay in a disposable environment, and preserve applied migration history.

A synthetic backup job is independent of the replay job so that backup-tool verification can pass without hiding this schema blocker.
