


## Plan: UK Postcode Lookup using Google Maps Geocoding API

### Approach
Use the existing `GOOGLE_MAPS_API_KEY` secret with the Google Maps Geocoding API to resolve UK postcodes into address suggestions. No new secrets needed.

### Changes

#### 1. Create edge function `supabase/functions/postcode-lookup/index.ts`
- Accept `POST { postcode: "LS1 2AB" }`
- Validate UK postcode format
- Call `https://maps.googleapis.com/maps/api/geocode/json?address={postcode},+UK&components=country:GB&key={GOOGLE_MAPS_API_KEY}`
- Parse `results[]` and map each to `{ id, label, line1, town, postcode }` using `address_components`
- Return `{ results: AxentraAddressSuggestion[] }`
- Include standard CORS headers

#### 2. Add to `supabase/config.toml`
- `[functions.postcode-lookup]` with `verify_jwt = false`

#### 3. Create `src/lib/postcodeApi.ts`
- Export `lookupPostcode(postcode: string): Promise<AddressSuggestion[]>`
- Calls the edge function, returns parsed results
- Handles errors gracefully (returns empty array)

#### 4. Update `src/pages/JobForm.tsx` — Pickup section
- Add "Find Address" button next to Pickup Postcode field
- On click: validate postcode, call `lookupPostcode()`, show dropdown of suggestions
- On suggestion select: fill `pickup_address_line1`, `pickup_city`, `pickup_postcode` via form refs
- Show "Can't find it? Enter address manually" footer in dropdown
- All fields remain editable at all times

#### 5. Update `src/pages/JobForm.tsx` — Delivery section
- Same pattern as Pickup: "Find Address" button, dropdown, manual entry footer

#### 6. State management in JobForm
- Add state: `pickupSuggestions`, `deliverySuggestions`, `pickupLookupLoading`, `deliveryLookupLoading`
- Suggestions dropdown rendered as a simple list below the postcode field
- Selecting a suggestion programmatically sets form field values and triggers route calculation

### No draft/resume changes
The existing autosave logic already works correctly — it saves on form change and restores on revisit. No gating changes needed per the user's current request (they only asked for postcode lookup with Google Maps).

### Files
1. **New**: `supabase/functions/postcode-lookup/index.ts`
2. **Edit**: `supabase/config.toml` — add function config
3. **New**: `src/lib/postcodeApi.ts`
4. **Edit**: `src/pages/JobForm.tsx` — add Find Address UI for both sections
