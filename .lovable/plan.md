

## Analysis

The user's actual Google Sheet headers differ from the current code in three ways:

1. **New fields not in DB**: `client_phone`, `client_email`, `client_company` — need migration to add these columns to the `jobs` table
2. **Truncated headers in sheet**: `"Delivery Contact Pho"` (not "Phone"), `"Delivery Time Fr"` (not "From") — the code must use these exact strings
3. **Header ordering**: The user provided the canonical header order which differs from the current `JOB_MASTER_HEADERS`

## Changes Required

### 1. Database migration — add 3 columns to `jobs`
```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_phone text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_email text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_company text;
```

### 2. Update `supabase/functions/google-sheets-sync/index.ts`

**A. Replace `JOB_MASTER_HEADERS`** with the user's exact 45-header list:
```
Created At, Updated At, App Job ID, Status,
Client Name, Client Notes, Client Phone, Client Email, Client Company,
Pickup Contact Name, Pickup Contact Phone, Pickup Address Line 1, Pickup Town / City, Pickup Postcode,
Pickup Time From, Pickup Time To, Pickup Access Notes,
Delivery Contact Name, Delivery Contact Pho, Delivery Address Line 1, Delivery Town / City, Delivery Postcode,
Delivery Time Fr, Delivery Time To, Delivery Access Notes, Promise By Time,
Vehicle Reg, Vehicle Make, Vehicle Model, Vehicle Colour, Vehicle Type, Vehicle Fuel Type,
Distance (Miles), Rate (£ per mile), Total Price (£), CAZ/ULEZ?, CAZ/ULEZ Cost (£), Other Expenses (£),
Driver Name, Driver ID, Job Notes, Cancellation Reason,
Sync to App?, Sync to Map?, Map Job ID
```

**B. Update `JOB_ENTRY_HEADER_MAP`** — add mappings for:
- `"Client Phone"` → `client_phone`
- `"Client Email"` → `client_email`  
- `"Client Company"` → `client_company`
- `"Delivery Contact Pho"` → `delivery_contact_phone`
- `"Delivery Time Fr"` → `delivery_time_from`

**C. Update `upsertJobMasterRow` switch cases** — change `"Delivery Contact Phone"` → `"Delivery Contact Pho"`, `"Delivery Time From"` → `"Delivery Time Fr"`, add `"Client Phone"`, `"Client Email"`, `"Client Company"` cases

**D. Update `handlePush` switch cases** — same header renames as above

### 3. Update `src/components/GoogleSheetsPanel.tsx`
Update the `COLUMN_MAP` display table to reflect the new canonical headers.

### 4. Update `src/integrations/supabase/types.ts`
Add the 3 new nullable columns to the Jobs type (auto-handled by migration).

