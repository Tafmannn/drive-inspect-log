-- One-off production data backfill: jobs.vehicle_type from make + model.
-- APPLIED to production (project lynkvfduzqdyvlzgriyh) on 2026-11-22 with owner approval: 46 rows
-- updated; verified afterwards: suv 33, hatchback 8, van 3, saloon 2, NULL 31.
-- Generated 2026-11-22 by src/features/damage/bodyTypeFromModel.ts against the
-- 77 production jobs that had no body type. 46 rows set; 31 left NULL (no make/model,
-- make/model mismatch, or model sold in several shapes). Only touches rows that are
-- still NULL, so it can't overwrite a value set since. Not a schema migration: the
-- ids exist only in production, so it lives here rather than in supabase/migrations.
-- Side effects: update_jobs_updated_at bumps updated_at on each changed row;
-- zz_jobs_catalogue_image re-evaluates catalogue_image_path (catalogue empty: no change).

BEGIN;

-- hatchback: 8 jobs
UPDATE public.jobs SET vehicle_type = 'hatchback'
 WHERE vehicle_type IS NULL AND id IN (
  'fec0252d-f9fe-40b3-b5a3-0c6ae77549ea',
  '78d6b802-84c9-4625-875a-c0819d9c9b30',
  '4fac2b39-b265-4a7d-b2ba-60f3ab9a71e4',
  'ce1b8039-bf47-49dd-aa3f-4162d94cab22',
  'f1460fdd-f73c-4803-9e79-6591aa105623',
  'e2a659ff-e4c9-422e-a431-937c5b32a5e1',
  '9ada8968-f5b4-4573-b365-b332148d2113',
  '3cc6ab85-4e90-4233-9c07-f94ab9c066a4'
);

-- saloon: 2 jobs
UPDATE public.jobs SET vehicle_type = 'saloon'
 WHERE vehicle_type IS NULL AND id IN (
  '907df4da-86cb-4a56-9300-6cc04c54cfc8',
  '1b9f7f18-be07-4dd0-86f5-8252f6b140dc'
);

-- suv: 33 jobs
UPDATE public.jobs SET vehicle_type = 'suv'
 WHERE vehicle_type IS NULL AND id IN (
  'b1c41968-c567-4bef-bfb4-1646e17e1b00',
  '56a5e15c-4cc1-4d8e-b6c9-d971c5aed27b',
  'f4d9c6b3-6f6f-4cd3-9ce6-8d23247a26d8',
  '50fb9b3c-3d66-4e64-bf71-7f5e8dbbdd4f',
  '9a0743f8-46d8-4a43-b411-6ab3ef8131e1',
  'f3a5522e-8fb3-46e6-bb0e-ababc5a7f528',
  '17c15f60-e148-422d-8af2-4eee8d2c3891',
  'f5a10e1f-37e0-424a-a18a-918edec27129',
  '13df42ee-aa49-4ddb-b834-8091b75325d9',
  'e5248afd-2ef1-4602-a72e-201cb315542a',
  'fbb5df95-9ea7-4900-bb16-6df83fc5dfdc',
  '430ecba0-f1b2-42f0-acb6-e84f58eaf847',
  '116f1d3b-2092-408f-b680-3276abc5c187',
  '9fbf5f8d-9593-4555-9af5-a30918e13aba',
  'b47c32da-dd86-4299-bd3e-4d4e0f084737',
  '03705f1c-a1b5-4527-9800-33b04c18ff09',
  '31f2dcf9-830c-4123-abb7-8995da6c2ec1',
  'e3f00952-0bb7-451c-8647-e9a38d86075f',
  '17dcbdf6-721f-4497-95d1-3437e593a5de',
  'b8e5a607-e8c3-4983-8e8a-de1ce8bf49a2',
  '64879599-59e3-431d-8d7c-11e482f150ff',
  'd332f2f4-9040-4657-ac6d-3985946e95e2',
  '4dd86764-13c3-4f8c-9c6e-8dccedc6e6f5',
  '48069214-4872-4df6-b288-eddc393e2a39',
  '5a0fef20-1c7e-4ee6-a14e-9d13f48ad3a4',
  'bb99edbc-a517-4b46-8674-5cd4b2f93e9d',
  '9b27396d-0dee-4326-afa5-0ed15325ea90',
  '93be2ad1-b5b0-49d5-957c-a97810a9fb57',
  'bf36e9ff-802d-4ead-912b-b25c5dd5e6d4',
  '25083c22-8127-438e-86a5-25b229fcc14c',
  '4210b517-c3f2-479c-a2bf-650eae26746a',
  '5c859237-0a3a-4645-a2a2-0740ff155291',
  '91d0a8c0-3ca6-4f7d-ab9d-939a8f3d72c4'
);

-- van: 3 jobs
UPDATE public.jobs SET vehicle_type = 'van'
 WHERE vehicle_type IS NULL AND id IN (
  'bbca6cfb-bb46-4056-94da-95055b09bf30',
  '0ac0c225-852a-47e1-a385-36ff16721855',
  '3e8b9ba6-f6ec-4f35-b918-3af7ad6f77f8'
);

COMMIT;

-- ROLLBACK (only reverts rows still holding the backfilled value):
-- UPDATE public.jobs SET vehicle_type = NULL WHERE vehicle_type = 'hatchback' AND id IN ('fec0252d-f9fe-40b3-b5a3-0c6ae77549ea', '78d6b802-84c9-4625-875a-c0819d9c9b30', '4fac2b39-b265-4a7d-b2ba-60f3ab9a71e4', 'ce1b8039-bf47-49dd-aa3f-4162d94cab22', 'f1460fdd-f73c-4803-9e79-6591aa105623', 'e2a659ff-e4c9-422e-a431-937c5b32a5e1', '9ada8968-f5b4-4573-b365-b332148d2113', '3cc6ab85-4e90-4233-9c07-f94ab9c066a4');
-- UPDATE public.jobs SET vehicle_type = NULL WHERE vehicle_type = 'saloon' AND id IN ('907df4da-86cb-4a56-9300-6cc04c54cfc8', '1b9f7f18-be07-4dd0-86f5-8252f6b140dc');
-- UPDATE public.jobs SET vehicle_type = NULL WHERE vehicle_type = 'suv' AND id IN ('b1c41968-c567-4bef-bfb4-1646e17e1b00', '56a5e15c-4cc1-4d8e-b6c9-d971c5aed27b', 'f4d9c6b3-6f6f-4cd3-9ce6-8d23247a26d8', '50fb9b3c-3d66-4e64-bf71-7f5e8dbbdd4f', '9a0743f8-46d8-4a43-b411-6ab3ef8131e1', 'f3a5522e-8fb3-46e6-bb0e-ababc5a7f528', '17c15f60-e148-422d-8af2-4eee8d2c3891', 'f5a10e1f-37e0-424a-a18a-918edec27129', '13df42ee-aa49-4ddb-b834-8091b75325d9', 'e5248afd-2ef1-4602-a72e-201cb315542a', 'fbb5df95-9ea7-4900-bb16-6df83fc5dfdc', '430ecba0-f1b2-42f0-acb6-e84f58eaf847', '116f1d3b-2092-408f-b680-3276abc5c187', '9fbf5f8d-9593-4555-9af5-a30918e13aba', 'b47c32da-dd86-4299-bd3e-4d4e0f084737', '03705f1c-a1b5-4527-9800-33b04c18ff09', '31f2dcf9-830c-4123-abb7-8995da6c2ec1', 'e3f00952-0bb7-451c-8647-e9a38d86075f', '17dcbdf6-721f-4497-95d1-3437e593a5de', 'b8e5a607-e8c3-4983-8e8a-de1ce8bf49a2', '64879599-59e3-431d-8d7c-11e482f150ff', 'd332f2f4-9040-4657-ac6d-3985946e95e2', '4dd86764-13c3-4f8c-9c6e-8dccedc6e6f5', '48069214-4872-4df6-b288-eddc393e2a39', '5a0fef20-1c7e-4ee6-a14e-9d13f48ad3a4', 'bb99edbc-a517-4b46-8674-5cd4b2f93e9d', '9b27396d-0dee-4326-afa5-0ed15325ea90', '93be2ad1-b5b0-49d5-957c-a97810a9fb57', 'bf36e9ff-802d-4ead-912b-b25c5dd5e6d4', '25083c22-8127-438e-86a5-25b229fcc14c', '4210b517-c3f2-479c-a2bf-650eae26746a', '5c859237-0a3a-4645-a2a2-0740ff155291', '91d0a8c0-3ca6-4f7d-ab9d-939a8f3d72c4');
-- UPDATE public.jobs SET vehicle_type = NULL WHERE vehicle_type = 'van' AND id IN ('bbca6cfb-bb46-4056-94da-95055b09bf30', '0ac0c225-852a-47e1-a385-36ff16721855', '3e8b9ba6-f6ec-4f35-b918-3af7ad6f77f8');
