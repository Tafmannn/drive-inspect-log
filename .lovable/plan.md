

## Complete Control Centre Unfinished Surfaces

Five distinct gaps in the Control Centre need resolution, ordered by dependency.

---

### 1. Compliance Data Flow (`/control/compliance`)

**Problem**: Page renders permanent loading skeletons with no data hook.

**Solution**: Create `useControlComplianceData.ts` hook querying:
- `inspections` table: count last 30 days, grouped by type (pickup/delivery)
- `damage_items` table: count where no resolution (unresolved = all, since there's no resolution column -- count open damage reports)
- Compliance rate = jobs with both pickup + delivery inspection / total completed jobs (last 30d)

Recent inspections table: last 20 inspections joined with job `vehicle_reg`, showing type, date, has_damage flag.

Outstanding issues table: damage items with inspection details, ordered by recency.

**Files**:
- New: `src/features/control/hooks/useControlComplianceData.ts` -- three react-query hooks (`useComplianceKpis`, `useRecentInspections`, `useOutstandingDamage`)
- Edit: `src/features/control/pages/ControlCompliance.tsx` -- replace skeleton UI with KpiStrip + two CompactTable sections using ControlShell pattern (matching other control pages)

---

### 2. Super Admin Quick Action Routing

**Problem**: All quick actions navigate to `/super-admin` instead of specific sub-pages.

**Solution**: Fix the `quickActions` array in `ControlSuperAdmin.tsx`:

| Action | Current Target | Correct Target |
|---|---|---|
| Create Org | `/super-admin` | `/super-admin/orgs` |
| Manage Users | `/super-admin` | `/super-admin/users` |
| Review Audit | `/super-admin` | `/super-admin/audit` |
| Review Exceptions | `/super-admin` | `/super-admin/attention` |
| Export Report | no-op, disabled | Implement CSV export of orgs+users summary, or keep disabled with tooltip |

**Files**:
- Edit: `src/features/control/pages/ControlSuperAdmin.tsx` -- fix 4 navigate targets (lines 63-67), implement basic export or add descriptive tooltip

---

### 3. Control Topbar Search (Command Palette)

**Problem**: Search button has no onClick, no state, no command palette.

**Solution**: Build a `⌘K` command palette dialog using the existing `Command` component (`src/components/ui/command.tsx`):
- Opens on button click or `⌘K` / `Ctrl+K`
- Searches control nav items (from `CONTROL_NAV` config) for quick page navigation
- Searches jobs by reg/ref (debounced query against `jobs` table, limit 5)
- Each result navigates on select

**Files**:
- New: `src/features/control/components/CommandPalette.tsx` -- dialog with cmdk search, nav items + job search
- Edit: `src/features/control/components/ControlTopbar.tsx` -- add state, onClick to search button, keyboard listener, render CommandPalette

---

### 4. Control Topbar Notifications

**Problem**: Bell button has no state, no source, no popover.

**Solution**: Wire the bell to show a popover/dropdown with the top 5 active attention exceptions (reusing `useAttentionData`). Show unread count badge from exception count.

**Files**:
- New: `src/features/control/components/NotificationsPopover.tsx` -- Popover with compact exception list, "View all" link to `/control` overview
- Edit: `src/features/control/components/ControlTopbar.tsx` -- replace static Bell button with NotificationsPopover

---

### 5. Admin Page Migration into Control Shell

**Problem**: `/control/admin` is a redirect shim with a "future update" note.

**Solution**: Embed the `UserIndex` component (already built) directly into ControlAdmin, plus inline `UserDetailEditor` via a slide-out panel or in-page view. Remove the "will be migrated" note.

**Files**:
- Edit: `src/features/control/pages/ControlAdmin.tsx` -- embed `UserIndex` + `UserDetailEditor` + `CreateUserModal` directly (same pattern as `AdminUsers.tsx` but within ControlShell), keep the org-settings quick link as secondary

---

### Technical Notes

- All data queries use existing Supabase tables (`inspections`, `damage_items`, `jobs`, `attention_acknowledgements`) with existing RLS policies -- no migrations needed.
- Compliance KPIs use org-scoped queries (RLS handles filtering via `user_org_id()`).
- Command palette reuses the existing `cmdk`-based Command component already in the project.
- No new Supabase tables, edge functions, or secrets required.

