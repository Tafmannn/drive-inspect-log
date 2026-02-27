

## Plan: UK Number Plate Badge + Status Colour System

### 1. Create `src/components/UKPlate.tsx` — Reusable UK reg plate component

- Horizontal rectangle, white background (`#FFFFFF`), 1px `#999` border, `border-radius: 3px`
- Left blue bar (~16% width): `#003399` background with white "UK" text vertically
- Reg text: system sans-serif, `font-weight: 700`, `letter-spacing: 2px`, uppercase, `font-size: 14px`
- Subtle `box-shadow` for depth
- Props: `reg: string`, optional `variant: 'front' | 'rear'` (rear = yellow `#FCD116`)
- Responsive: uses `whitespace-nowrap`, fixed padding `px-2 py-0.5`

### 2. Update `src/lib/statusConfig.ts` — New colour system with exact hex values

Replace the current semantic colour approach with explicit hex-based classes:

| Status | Label | BG | Text |
|---|---|---|---|
| `ready_for_pickup` | READY | `#34C759` | white |
| `pickup_in_progress`, `pickup_complete`, `in_transit`, `delivery_in_progress` | IN PROGRESS | `#FF9500` | white |
| `delivery_complete`, `pod_ready`, `completed` | COMPLETED | `#5856D6` | white |
| `cancelled` | CANCELLED | `#FF3B30` | white |
| `new`, `draft`, `incomplete` | NEW / DRAFT | `#007AFF` / `#8E8E93` | white |

- `getStatusBadgeClasses` returns inline-style-friendly hex values instead of Tailwind semantic classes
- Export a `getStatusStyle()` function returning `{ backgroundColor, color, label }`
- Status pills: uppercase, `rounded-full`, `px-2.5 py-1`, `text-xs font-semibold`

### 3. Update `src/components/JobCard.tsx` — Integrate both components

- Replace the `<Badge>` for `plateNumber` with `<UKPlate reg={plateNumber} />`
- Replace the status `<Badge>` with an inline-styled pill using `getStatusStyle()`
- Ensure plate is top-right, status pill is in the summary meta line

### 4. Update `src/index.css` — No changes needed (hex values used directly)

### Files modified:
1. **New**: `src/components/UKPlate.tsx`
2. **Edit**: `src/lib/statusConfig.ts`
3. **Edit**: `src/components/JobCard.tsx`

