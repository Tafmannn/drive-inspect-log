

## Plan: Restyle DriverJobCard to match screenshot layout

### What changes

**File: `src/lib/driverJobSummary.ts`** — Add missing fields to the summary model:
- `pickup_contact_name`, `pickup_contact_phone` (both sides always visible)
- `delivery_contact_name`, `delivery_contact_phone`
- `pickup_address_full` (line1 + city + postcode)
- `delivery_address_full` (line1 + city + postcode)
- `client_name` (for the card header / avatar)

No logic changes — just passing through raw job fields.

**File: `src/components/DriverJobCard.tsx`** — Full visual rewrite to match screenshot:

1. **Header row**: Avatar circle (first letter of client name) + client name + job ref on left, UK plate on right
2. **Status badge**: Colored pill using `getStatusStyle()` from statusConfig (matching the hex palette: blue/green/orange/indigo/red)
3. **Collect From section**: Label "Collect From", then icon rows for:
   - Contact name (grid icon)
   - Phone number (phone icon, clickable `tel:` link in blue)
   - Company name (plain text, smaller)
   - Full address (pin icon, clickable Google Maps link in blue)
4. **Deliver To section**: Same layout with delivery details
5. **Constraint warning**: Red text for "Do not deliver before" date
6. **Primary CTA**: Full-width button, dark blue background, white text, chevron right

Remove: workflow badge map, priority row helper, route economics row, compact postcode row, secondary Call/Maps icon buttons (now inline as clickable links).

### What does NOT change
- `DriverJobSummary` derivation logic, priority/workflow/action state rules
- `JobList.tsx` page, deviation prompt, ranking, filtering
- Props interface shape (`summary`, `onPrimaryAction`, `onCardClick`)
- `driverJobSummary.ts` state derivation functions

