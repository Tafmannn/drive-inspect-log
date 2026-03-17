INSERT INTO public.driver_profiles (user_id, org_id, full_name, display_name, phone, is_active)
VALUES (
  'b8ab7f5a-8a37-40ba-b8ba-d284a0a20a5f',
  'a0000000-0000-0000-0000-000000000001',
  'Drippy Kickz',
  NULL,
  '07585894837',
  true
)
ON CONFLICT DO NOTHING;