

# Validation: Admin Control Centre Overview Dispatch Expansion

## 1. VALIDATION RESULT

**3 issues found — 2 bugs, 1 semantic risk. Fixes required before rollout.**

---

## 2. PASS / FAIL BY AREA

| Area | Result | Notes |
|---|---|---|
| 1. Queue correctness | **FAIL** | `assigned` status counted in KPI but missing from dispatch board table |
| 2. KPI correctness | **PASS** | All queries use correct `head:true` counts, stale threshold matches Jobs page (24h) |
| 3. Action correctness | **FAIL** | AssignDriverModal missing invalidation for 3 overview query keys |
| 4. State quality | **PASS** | Loading, empty, row click, stale cue all wired correctly |
| 5. Truthfulness / semantic quality | **PASS with risk** | "Active Dispatch Board" includes PENDING_STATUSES — acceptable if description stays vague ("jobs in pipeline") |
| 6. Regression check | **PASS** | Jobs page columns, filters, and jobsUtils shared logic all consistent |

---

## 3. ISSUES FOUND

### BUG 1: Missing cache invalidation after driver assignment (HIGH)

`AssignDriverModal.tsx` invalidates these overview keys on assign:
- `control-admin-kpis` ✓
- `control-dispatch-board` ✓

But does **not** invalidate:
- `control-unassigned-queue` ✗
- `control-overview-pod-queue` ✗
- `control-recent-completed` ✗

**Impact:** After assigning a driver from the Needs Assignment queue, the row stays visible until the 30s stale timer fires. Same for unassign — the job won't reappear in the unassigned queue immediately.

**Fix:** Add 3 `invalidateQueries` calls in both `onSuccess` handlers (assign + unassign) in `AssignDriverModal.tsx`.

### BUG 2: `assigned` status missing from dispatch board (MEDIUM)

The KPI "Ready to Dispatch" counts `["ready_for_pickup", "assigned"]` (line 33 of useAdminControlData). But `useDispatchBoard()` filters by `[...ACTIVE_STATUSES, ...PENDING_STATUSES]` — and `assigned` is **not** in `ACTIVE_STATUSES`. So jobs with status `assigned` are counted in the KPI but never appear in any table on the overview.

**Fix:** Add `"assigned"` to the dispatch board's status array in `useDispatchBoard()`.

### SEMANTIC RISK: "Active Dispatch Board" name (LOW — no fix needed)

The board includes PENDING_STATUSES (pod_ready, delivery_complete). The title "Active Dispatch Board" could imply only in-motion jobs. However, the description says "jobs in pipeline" which is sufficiently vague. No fix needed — just noting the risk.

---

## 4. FILES TO UPDATE

| File | Change |
|---|---|
| `src/features/control/components/AssignDriverModal.tsx` | Add 3 missing `invalidateQueries` calls in both assign and unassign `onSuccess` |
| `src/features/control/hooks/useAdminControlData.ts` | Add `"assigned"` to dispatch board status filter |

---

## 5. FIXES TO APPLY

### Fix 1: AssignDriverModal — add missing invalidation keys

In both `onSuccess` callbacks (assign mutation ~line 81, unassign mutation ~line 115), add:
```typescript
queryClient.invalidateQueries({ queryKey: ["control-unassigned-queue"] });
queryClient.invalidateQueries({ queryKey: ["control-overview-pod-queue"] });
queryClient.invalidateQueries({ queryKey: ["control-recent-completed"] });
```

### Fix 2: useAdminControlData — include `assigned` in dispatch board

In `useDispatchBoard()` line 103, change:
```typescript
.in("status", [...(ACTIVE_STATUSES as string[]), ...(PENDING_STATUSES as string[])])
```
to:
```typescript
.in("status", [...(ACTIVE_STATUSES as string[]), ...(PENDING_STATUSES as string[]), "assigned"])
```

---

## 6. SEMANTIC RISKS STILL PRESENT

- "Active Dispatch Board" includes pending review jobs — acceptable given "pipeline" description
- Stale KPI excludes `assigned` status jobs — acceptable since assignment implies recent action

## 7. NEXT RECOMMENDED STEP

After fixes: test assign flow from overview Needs Assignment queue, verify the row disappears immediately and KPIs update.

