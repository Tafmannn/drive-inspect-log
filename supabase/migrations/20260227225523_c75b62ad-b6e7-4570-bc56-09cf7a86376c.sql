-- Delete duplicate jobs created during testing (keep originals)
DELETE FROM jobs WHERE id IN (
  '8c786da0-50c8-43ed-9fe7-75be433b0ada',
  'd0127afe-ed6a-47a0-ae66-3aa3f1080440'
);

-- Also delete the 2 extra duplicates from the third pull
DELETE FROM jobs WHERE vehicle_reg IN ('YX70 ABC', 'AH25 UHE')
  AND id NOT IN ('591b609d-89ea-482f-9026-afe89ac0d8eb', '50fb9b3c-3d66-4e64-bf71-7f5e8dbbdd4f');