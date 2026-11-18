#!/usr/bin/env python3
"""Field/control preservation matrices — status is computed by searching the real prototype HTML, not asserted."""
import re,html,os
import os; D=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
def txt(files):
    s=''
    for f in files:
        p=f'{D}/mockups/{f}'
        if os.path.exists(p): s+=open(p).read()
    s=html.unescape(s); return re.sub(r'\s+',' ',s).lower()
V1={1:['v1-first-pass/01-dashboard-desktop.html'],2:['v1-first-pass/02-jobs-desktop.html'],3:['v1-first-pass/03-job-detail-mobile.html'],4:['v1-first-pass/04-inspection-mobile.html'],5:['v1-first-pass/05-admin-dashboard-desktop.html'],6:['v1-first-pass/06-super-admin-desktop.html']}
V2={1:['v2/01-command-center.html','v2/08-states.html'],2:['v2/02-jobs.html','v2/02b-jobs-queues.html','v2/08-states.html'],3:['v2/03-job-detail-mobile.html','v2/08-states.html'],4:['v2/04-inspection-mobile.html'],5:['v2/05-admin-dashboard.html'],6:['v2/06a-super-admin-control.html','v2/06b-super-admin-dashboard.html','v2/06c-super-admin-settings.html']}
T1={k:txt(v) for k,v in V1.items()}; T2={k:txt(v) for k,v in V2.items()}
# (area, element, kind, source, needle, improvement/override)  override: 'P' = placeholder (content unverified), 'N' = not drawn by design (documented), None = auto
E={}
E[1]=[
('Shell','Left sidebar with 7 nav groups (Platform only for super-admin)','nav','ControlLayout / navigation.ts','compliance & audit',''),
('Shell','Sidebar "Back to App" link','control','ControlLayout','back to app',''),
('Shell','Sidebar collapse control (aria "Collapse sidebar")','control','ControlSidebar.tsx','collapse sidebar',''),
('Shell','Global search with ⌘K hint','control','ControlLayout','⌘k',''),
('Shell','Notifications bell','control','NotificationsPopover.tsx','notifications',''),
('Shell','User avatar / role label','info','ControlLayout','>admin<',''),
('Shell','Breadcrumb trail','nav','Breadcrumbs.tsx','class="crumbs"',''),
('Header','Title "Command Center"','info','ControlOverview.tsx','command center',''),
('Header','Subtitle "Organisation dispatch & operational control"','info','ControlOverview.tsx','organisation dispatch & operational control',''),
('Header','Live status chip (Critical / Attention Required / All Clear)','info','ControlOverview.tsx','attention required',''),
('KPI','Ready to Dispatch (click-through)','control','ControlOverview.tsx','ready to dispatch',''),
('KPI','In Transit (click-through)','control','ControlOverview.tsx','in transit',''),
('KPI','Exceptions (scrolls to Attention)','control','ControlOverview.tsx','>exceptions<',''),
('KPI','POD Review (click-through)','control','ControlOverview.tsx','>pod review<',''),
('KPI','Completed Today (click-through)','control','ControlOverview.tsx','completed today',''),
('KPI','Unassigned (click-through)','control','ControlOverview.tsx','>unassigned<',''),
('KPI','Stale (>24h) (click-through)','control','ControlOverview.tsx','stale (>24h)',''),
('Quick actions','New Job','control','ControlOverview.tsx','new job',''),
('Quick actions','View All Jobs','control','ControlOverview.tsx','view all jobs',''),
('Quick actions','Drivers','control','ControlOverview.tsx','>drivers<',''),
('Quick actions','Expenses','control','ControlOverview.tsx','>expenses<',''),
('Attention Required','Section title + "N active exceptions"','info','ControlOverview.tsx','3 active exceptions',''),
('Attention Required','Refresh button','control','ControlOverview.tsx','refresh',''),
('Attention Required','Exception rows (AttentionQueue) with severity','info','AttentionQueue','critical',''),
('Attention Required','"Showing top 10 of N exceptions"','info','ControlOverview.tsx','showing top 10 of 12 exceptions',''),
('Attention Required','"N acknowledged" disclosure toggle','control','ControlOverview.tsx','3 acknowledged',''),
('Attention Required','Acknowledged list (dimmed) after toggle','info','ControlOverview.tsx','',"N"),
('Needs Assignment','Section + "N active jobs with no driver — oldest first"','info','ControlOverview.tsx','no driver — oldest first',''),
('Needs Assignment','"View all"','control','ControlOverview.tsx','view all',''),
('Needs Assignment','Columns Ref · Vehicle · Route · Status · Updated · actions','info','ControlOverview.tsx','<th>route</th>',''),
('Active Dispatch Board','Section + "N jobs in pipeline"','info','ControlOverview.tsx','jobs in pipeline',''),
('Active Dispatch Board','Columns Ref · Vehicle · Driver · Route · Status · Updated · actions','info','ControlOverview.tsx','<th>driver</th>',''),
('Row actions','Assign / Reassign','control','ControlOverview.tsx','reassign',''),
('Row actions','POD (when reviewable)','control','ControlOverview.tsx','>pod<',''),
('Row actions','Row click opens job','control','ControlOverview.tsx','',"N"),
('POD Review Queue','Section + "N jobs awaiting closure — oldest first"','info','ControlOverview.tsx','awaiting closure — oldest first',''),
('POD Review Queue','"Review all"','control','ControlOverview.tsx','review all',''),
('POD Review Queue','"Showing top N of M jobs awaiting closure"','info','ControlOverview.tsx','jobs awaiting closure',''),
('Recently Completed','Section + "Latest completed jobs"','info','ControlOverview.tsx','latest completed jobs',''),
('Empty states','"All active jobs are assigned." / "No active jobs in pipeline." / "No jobs awaiting POD review." / "No recent completions."','info','ControlOverview.tsx','no recent completions',''),
('Dialog','Assign driver dialog (AssignDriverModal)','control','AssignDriverModal','assign driver',"P"),
('States','Loading skeleton / "Loading exceptions…"','info','ControlOverview.tsx','skel',''),
]
E[2]=[
('Header','Title "Jobs" + subtitle "Triage, dispatch and progress jobs"','info','ControlJobs.tsx','triage, dispatch and progress jobs',''),
('Header','Run order button (aria "Set driver run order")','control','ControlJobs.tsx','set driver run order',''),
('Header','New job button','control','ControlJobs.tsx','new job',''),
('KPI','Unassigned','control','ControlJobs.tsx','>unassigned<',''),
('KPI','Stale (>24h)','control','ControlJobs.tsx','stale (>24h)',''),
('KPI','Evidence gaps','control','ControlJobs.tsx','evidence gaps',''),
('KPI','POD Review','control','ControlJobs.tsx','>pod review<',''),
('KPI','Active','control','ControlJobs.tsx','>active<',''),
('KPI','Total jobs','control','ControlJobs.tsx','total jobs',''),
('Toolbar','Search "Search reg, client, driver, postcode…" (aria "Search jobs")','control','ControlJobs.tsx','search reg, client, driver, postcode',''),
('Toolbar','10 view chips (group aria "Job views")','control','jobsView.ts','job views',''),
('Toolbar','Sort toggle "By updated" / "By job date"','control','ControlJobs.tsx','by updated',''),
('Queues view','Needs attention · empty "No jobs need attention."','info','ControlJobs.tsx','needs attention',''),
('Queues view','Unassigned · "All jobs are assigned."','info','ControlJobs.tsx','unassigned',''),
('Queues view','Missing evidence · "No evidence gaps found."','info','ControlJobs.tsx','missing evidence',''),
('Queues view','In progress · "No active jobs with assigned drivers."','info','ControlJobs.tsx','in progress',''),
('Queues view','POD review · "No jobs pending review."','info','ControlJobs.tsx','no jobs pending review',''),
('Queues view','Recently completed','info','ControlJobs.tsx','recently completed',''),
('Queues view','Truncation notice "most recently updated 300 jobs"','info','ControlJobs.tsx','most recently updated 300 jobs',''),
('Error','"Failed to load jobs: …" + Retry','control','ControlJobs.tsx','failed to load jobs',''),
('Table','Columns Ref · Vehicle · Client · Driver · Route · Status · Updated · actions','info','JobsColumns.tsx','<th>client</th>',''),
('Table','Status badge + Stale cue','info','JobsColumns.tsx','>stale<',''),
('Table','Status cue "Blocked" (title tooltip in source)','info','JobsColumns.tsx','blocked',''),
('Table','Status cue "Action needed"','info','JobsColumns.tsx','action needed',''),
('Table','Status cue "Heads up"','info','JobsColumns.tsx','heads up',''),
('Table','Row action View','control','JobsColumns.tsx','view job ax',''),
('Table','Row action Assign / Reassign','control','JobsColumns.tsx','reassign driver for job',''),
('Table','Row action POD (canReviewPod)','control','JobsColumns.tsx','pod review for job',''),
('Table','Row action Expense (canAddExpense)','control','JobsColumns.tsx','add expense to job',''),
('Table','Row action "Resolve evidence" (evidence view)','control','JobsColumns.tsx','resolve evidence',''),
('Table','Row click opens job','control','ControlJobs.tsx','',"N"),
('Table','Empty "No jobs match your filters."','info','ControlJobs.tsx','no jobs match your filters',''),
('Mobile','Card list with the same actions (renderCard)','control','ControlJobs.tsx','class="jcard"',''),
('Dialog','Run order dialog (RunOrderModal, move up/down)','control','RunOrderModal.tsx','',"N"),
('Dialog','Assign driver dialog','control','AssignDriverModal','assign driver',"P"),
]
E[3]=[
('Shell','Back button + title "Job {ref}"','nav','JobDetail.tsx','job ax-10482',''),
('Shell','Bottom nav (4 tabs)','nav','BottomNav.tsx','aria-label="primary"',''),
('Header card','Status badge','info','JobHeaderCard.tsx','in progress',''),
('Header card','UK plate','info','UKPlate.tsx','xx21 axe',''),
('Header card','"Job {ref}" line','info','JobHeaderCard.tsx','>job ax-10482<',''),
('Header card','Make · Model — Colour (Year)','info','JobHeaderCard.tsx','ford transit custom — white',''),
('Header card','Evidence status badges slot','info','EvidenceStatusBadges.tsx','evidence ok',"P"),
('Workflow','Pickup → Transit → Delivery progress','info','JobDetail.tsx','pickup ✓',''),
('Workflow','Next-step primary CTA','control','JobDetail.tsx','start delivery inspection',''),
('Workflow','Review-only warning variant of next step','info','JobDetail.tsx','',"N"),
('Collect From','Contact name · company · address','info','JobDetail.tsx','dana whitfield',''),
('Collect From','Time window "Time: from – to"','info','JobDetail.tsx','time: 08:00',''),
('Collect From','Notes strip','info','JobDetail.tsx','keys with reception',''),
('Collect From','"Access: …" strip','info','JobDetail.tsx','access: gate code',''),
('Collect From','Call (disabled if no phone)','control','JobDetail.tsx','>call<',''),
('Collect From','Navigate','control','JobDetail.tsx','>navigate<',''),
('Deliver To','Same fields as Collect From','info','JobDetail.tsx','chris marlowe',''),
('Inspections','Pickup Inspection status line','info','JobDetail.tsx','pickup inspection',''),
('Inspections','Delivery Inspection status line','info','JobDetail.tsx','delivery inspection',''),
('QR Handover','Collection QR button','control','JobDetail.tsx','collection qr',''),
('QR Handover','Delivery QR button','control','JobDetail.tsx','delivery qr',''),
('QR Handover','QR display dialog','control','QrDisplayModal.tsx','',"N"),
('Actions','Expenses button','control','JobDetail.tsx','>expenses<',''),
('Actions','POD Report button','control','JobDetail.tsx','pod report',''),
('Notes','Job Notes','info','JobDetail.tsx','job notes',''),
('Admin only','Evidence Health banner','info','EvidenceHealthBanner.tsx','evidence health',"P"),
('Admin only','Job price editor','control','JobPriceEditor.tsx','job price',"P"),
('Admin only','Pricing suggestion panel','control','PricingSuggestionPanel.tsx','pricing suggestion',"P"),
('Admin only','Pricing audit timeline','info','PricingAuditTimeline.tsx','pricing audit',"P"),
('Admin only','Change status… select','control','JobAdminControls.tsx','change status',''),
('Admin only','Cancel button','control','JobAdminControls.tsx','>cancel<',''),
('Admin only','Inspection Photos — Collection / Delivery / Damage','info','JobDetail.tsx','>damage<',''),
('Admin only','Photo viewer (full screen)','control','PhotoViewer.tsx','',"N"),
('States','"Job not found"','info','JobDetail.tsx','job not found',''),
('States','Driver job locked screen','info','DriverJobLocked.tsx','',"N"),
]
E[4]=[
('Shell','Back button · "Pickup inspection" · job ref · plate','nav','InspectionFlow.tsx','pickup inspection',''),
('Shell','Step progress (6 pickup / 5 delivery)','info','InspectionFlow.tsx','step 1 of 6',''),
('Shell','Back / Next buttons','control','InspectionFlow.tsx','>next<',''),
('Step 1','Odometer reading *','control','InspectionFlow.tsx','odometer reading',''),
('Step 1','Fuel level * (Empty, 1/4, 1/2, 3/4, Full)','control','FUEL_LEVEL_MAP','3/4',''),
('Step 2','Vehicle Condition (Clean, Dirty, Wet, Snow Covered, Iced Over)','control','InspectionFlow.tsx','snow covered',''),
('Step 2','Light (Good, Poor, Dark, Artificial, Raining)','control','InspectionFlow.tsx','raining',''),
('Step 2','Oil Level (Ok / Issue)','control','InspectionFlow.tsx','oil level',''),
('Step 2','Water Level (Ok / Issue)','control','InspectionFlow.tsx','water level',''),
('Step 2','Notes textarea ("Notes")','control','InspectionFlow.tsx','placeholder="notes"',''),
('Step 2','Handbook · Service Book · MOT · V5 (Yes/No/N/A)','control','InspectionFlow.tsx','service book',''),
('Step 2','Parcel Shelf · Spare Wheel · Tool Kit · Tyre Inflation Kit','control','InspectionFlow.tsx','tyre inflation kit',''),
('Step 2','Locking Wheel Nut · Sat Nav Working','control','InspectionFlow.tsx','locking wheel nut',''),
('Step 2','Number of Keys * (number input with −/+)','control','InspectionFlow.tsx','number of keys',''),
('Step 2','Alloys or Trims (Alloys / Trims)','control','InspectionFlow.tsx','alloys or trims',''),
('Step 2','Alloys Damaged? · Wheel Trims Damaged? (Yes/No)','control','InspectionFlow.tsx','wheel trims damaged?',''),
('Step 2','EV Charging Cables · Aerial · Customer Paperwork','control','InspectionFlow.tsx','customer paperwork',''),
('Step 3','Vehicle diagram + damage pins','control','VehicleDiagram.tsx','vehiclediagram',''),
('Step 3','Damage modal (VehicleDamageModal)','control','VehicleDamageModal.tsx','',"N"),
('Step 3','Damage items list (edit)','control','InspectionFlow.tsx','edit damage 1',''),
('Step 4','7 photo slots (Front, Rear, Driver Side, Passenger Side, Interior, Dashboard, Fuel Gauge)','control','PHOTO_TYPES_BY_INSPECTION','fuel gauge',''),
('Step 4','Additional photos + label','control','InspectionFlow.tsx','additional photo label',''),
('Step 5','Driver Name * + driver signature + Clear','control','InspectionFlow.tsx','driver name',''),
('Step 5','Customer Name * + customer signature','control','InspectionFlow.tsx','customer name',''),
('Step 6','Review summary (REVIEW_CHECKLIST rows)','info','InspectionFlow.tsx','20 items',''),
('Step 6','"Please ensure all information is correct…"','info','InspectionFlow.tsx','please ensure all information is correct',''),
('Step 6','Submit inspection','control','InspectionFlow.tsx','submit inspection',''),
('Validation','Toast "Please complete the required fields" + missing list','info','InspectionFlow.tsx','please complete the required fields',''),
('Validation','Inline field errors','info','(new, rendered from the same missing list)','is required',''),
('Safety','Storage-failure card / interrupted-inspection resume / offline banner','info','StorageFailureCard, ResumeInterruptedInspection, OfflineBanner','',"N"),
('Flow','Delivery variant (5 steps: no checklist)','info','inspectionFormConfig.ts','',"N"),
]
E[5]=[
('Shell','Title "Admin" + back','nav','AdminDashboard.tsx','>admin<',''),
('Shell','Bottom nav','nav','BottomNav.tsx','',"N"),
('KPI','Unassigned · Stale · POD Review · Evidence (click-through)','control','AdminDashboard.tsx','>evidence<',''),
('Compliance','Strip: N pending review · N missing docs · N expired → /admin/onboarding','control','AdminDashboard.tsx','pending review',''),
('Needs Action','Ranked "Needs Action" queue (+ "No interventions required.")','info','AdminDashboard.tsx','needs action',''),
('Stale Active','Section list','info','AdminDashboard.tsx','stale active',''),
('Awaiting Review','Section list','info','AdminDashboard.tsx','awaiting review',''),
('Operations Buckets','12 bucket tiles (labels from operationsBuckets.ts)','control','operationsBuckets.ts','jobs with weak pod',''),
('Management','Full Jobs Queue','control','AdminDashboard.tsx','full jobs queue',''),
('Management','Fleet & Drivers','control','AdminDashboard.tsx','fleet & drivers',''),
('Management','Driver Onboarding','control','AdminDashboard.tsx','driver onboarding',''),
('Management','POD Closure','control','AdminDashboard.tsx','pod closure',''),
('Management','Expenses & Finance','control','AdminDashboard.tsx','expenses & finance',''),
('Management','Super Admin Console (super-admin only)','control','AdminDashboard.tsx','super admin console',''),
('States','"Access Denied" screen','info','AdminDashboard.tsx','',"N"),
]
E[6]=[
('/control/super-admin','5 KPI tiles: Organisations · Total Users · Active Jobs · Platform Exceptions · Audit Events Today','control','ControlSuperAdmin.tsx','audit events today',''),
('/control/super-admin','Quick actions: Create Org · Manage Users · Review Audit · Review Exceptions · Export Report','control','ControlSuperAdmin.tsx','export report',''),
('/control/super-admin','Global Incident Queue + Refresh','info','ControlSuperAdmin.tsx','global incident queue',''),
('/control/super-admin','Organisations ("All registered tenants")','info','ControlSuperAdmin.tsx','all registered tenants',''),
('/control/super-admin','Recent Audit Activity ("Last 20 administrative actions")','info','ControlSuperAdmin.tsx','last 20 administrative actions',''),
('/control/super-admin','Error & Warning Feed ("Recent system errors")','info','ControlSuperAdmin.tsx','recent system errors',''),
('/super-admin','4 tiles: Organisations · Users · Active Jobs · Audit Today','control','SuperAdminDashboard.tsx','audit today',''),
('/super-admin','Quick Actions: Create Organisation · Create User · Review Exceptions · Inspect Audit Log','control','SuperAdminDashboard.tsx','inspect audit log',''),
('/super-admin','Recent Audit','info','SuperAdminDashboard.tsx','recent audit',''),
('/super-admin','Platform Management: Organisations · Users · Jobs Monitor · Errors · Attention · Settings','control','SuperAdminDashboard.tsx','identity & flags',''),
('/super-admin/settings','Identity & Role Model (Auth source · Roles · Tenant isolation · Manage users)','info','SuperAdminPages.tsx','tenant isolation',''),
('/super-admin/settings','Feature switches (FeatureFlagsCard)','control','FeatureFlagsCard.tsx','feature switches',"P"),
('/super-admin/settings','Platform Controls (Bulk operations · Maintenance mode — "Not yet available")','info','SuperAdminPages.tsx','maintenance mode',''),
('Sub-pages','Organisations (search · Create) / Users (filters · Sync Auth · New User) / Jobs Monitor (search · chips) / Audit Log / Error Feed / Global Attention (tiles · severity chips · filters)','control','SuperAdminPages.tsx','',"N"),
('Shell','"Platform → Super Admin" nav group visible only to super-admin','nav','navigation.ts','platform',''),
]
LABEL={'':'', 'P':'Placeholder','N':'Not drawn'}
def status(i,e):
    area,el,kind,src,needle,ov=e
    if ov=='N': return ('Not drawn','Documented: restyle via shared components; no prototype evidence')
    in1 = (needle!='' and needle in T1[i])
    in2 = (needle!='' and needle in T2[i])
    if ov=='P': return ('Placeholder' if in2 else 'MISSING','Shown as a labelled placeholder — content/behaviour not reviewed')
    return (('Preserved' if in2 else 'MISSING'), '')
def build():
    out=['# Field and control preservation matrices (six screens)\n',
    'Purpose: prove that **no existing element silently disappears** in the Concept A prototypes. For each screen, every element extracted from the source (`ControlOverview.tsx`, `ControlJobs.tsx`+`JobsColumns.tsx`, `JobDetail.tsx`, `InspectionFlow.tsx`+`inspectionFormConfig.ts`, `AdminDashboard.tsx`, `SuperAdminDashboard.tsx`+`SuperAdminPages.tsx`+`ControlSuperAdmin.tsx`) is listed with:\n',
    '- **v1** — present in the first-pass prototype (`mockups/v1-first-pass/0N-*.html`)? Computed by searching that HTML.',
    '- **v2** — present in the refined prototype (`mockups/v2/*.html`)? Computed the same way.',
    '- **Status** — *Preserved* (found in v2) · *Placeholder* (shown as a labelled stand-in because its content was not reviewed) · *Not drawn* (documented, not prototyped; must be restyled via shared components, no evidence yet) · *MISSING* (would be a defect).',
    '',
    'The status column is **computed by `tools/preservation-matrix.py` from the prototype HTML**, not asserted by hand. A match means the label text/attribute exists in the file (substring search, so a common word can over-match; Command Center and Jobs were also checked by eye in the screenshots); it does not prove visual quality. Elements tagged *Placeholder* or *Not drawn* are **not verified** and must be checked against the real component before implementation.\n']
    tot={'Preserved':0,'Placeholder':0,'Not drawn':0,'MISSING':0}
    v1miss=0
    names={1:'1. Main dashboard — Command Center (`/control`)',2:'2. Jobs management (`/control/jobs`)',3:'3. Job detail — mobile (`/jobs/:jobId`)',4:'4. Vehicle inspection — mobile (`/inspection/:jobId/:type`)',5:'5. Admin dashboard (`/admin`, `/`)',6:'6. Super-admin (`/control/super-admin`, `/super-admin`, `/super-admin/settings`)'}
    sections=[]
    for i in range(1,7):
        rows=[];c={'Preserved':0,'Placeholder':0,'Not drawn':0,'MISSING':0}
        for e in E[i]:
            area,el,kind,src,needle,ov=e
            st,note=status(i,e); c[st]+=1; tot[st]+=1
            in1='n/a' if (needle=='' or ov=='N') else ('yes' if needle in T1[i] else '**no**')
            if in1=='**no**': v1miss+=1
            rows.append(f'| {area} | {el} | {kind} | `{src}` | {in1} | {"yes" if st in ("Preserved","Placeholder") else ("n/a" if st=="Not drawn" else "**no**")} | **{st}** | {note} |')
        sections.append((i,rows,c))
    out.append('## Summary\n'); out.append('| Screen | Preserved | Placeholder | Not drawn | MISSING |'); out.append('|---|---|---|---|---|')
    for i,rows,c in sections: out.append(f'| {names[i]} | {c["Preserved"]} | {c["Placeholder"]} | {c["Not drawn"]} | {c["MISSING"]} |')
    out.append(f'| **Total** | **{tot["Preserved"]}** | **{tot["Placeholder"]}** | **{tot["Not drawn"]}** | **{tot["MISSING"]}** |\n')
    out.append(f'First-pass prototypes (v1) were missing **{v1miss}** of the elements below that are present in v2 — including the whole set of Command Center shortcuts, the real Command Center KPIs, the real Admin Management items and the super-admin Quick Actions. v1 also *added* elements that do not exist in the source (chip counts, "Users / Timesheets / Create invoice" Management items, mismatched KPI labels); those were removed in v2.\n')
    for i,rows,c in sections:
        out.append(f'## {names[i]}\n'); out.append('| Area | Existing element | Type | Source | In v1 | In v2 | Status | Note |'); out.append('|---|---|---|---|---|---|---|---|'); out+=rows; out.append('')
    out.append('## UI-only improvements required (apply during implementation, no behaviour change)\n')
    out+=['| ID | Improvement | Elements affected | Traceability |','|---|---|---|---|',
    '| UI-1 | Status badge: dark text on tint + dot; keep label text | every status badge (screens 1,2,3,5) | U01 |',
    '| UI-2 | KPI tiles: label top-left, icon chip top-right, value below; count-aware column rules, last odd tile spans on mobile | all KPI strips (screens 1,2,5,6) | U07, V01, V02 |',
    '| UI-3 | Jobs row actions as 32px icon buttons with accessible names + tooltips (labels return on mobile cards) | screen 2 row actions | U14 and width evidence from the Jobs table render |',
    '| UI-4 | Status secondary cues (Stale · Blocked · Action needed · Heads up) as visible text, not tooltip-only | screen 2 status cell | keyboard/touch users cannot hover (skill: "expose full text to keyboard pointer and touch users") |',
    '| UI-5 | Validation: keep toast **and** render the same `missing` list as an inline summary + per-field messages | screen 4 | skill UX "Focusable Error Summary / Error Placement"; **needs sign-off** because focus management is behaviour-adjacent |',
    '| UI-6 | Chip rows: wrap on desktop; on mobile keep horizontal scroll but add an edge fade | Jobs/POD/Drivers/Expenses chip rows | V04 (clipped chips) |',
    '| UI-7 | Compact labels: `nowrap` + shrink, allow two-line KPI labels instead of "OR G…" truncation | mobile KPI tiles | V01, V02 |',
    '| UI-8 | Ops-role pages inside the shared shell | `/`, `/admin`, `/super-admin*`, `/admin/users` | U03, U04, V05, V08 |',
    '| UI-9 | Driver Job Detail keeps bottom nav **and** sticky next-step CTA (CTA above nav) | screen 3 | restored after review found v2 had replaced the nav |','']
    return '\n'.join(out),tot,v1miss
if __name__=='__main__':
    m,tot,v1=build(); open(f'{D}/11-preservation-matrices.md','w').write(m); print(tot,v1)
    # print missing items
    for i in range(1,7):
        for e in E[i]:
            s,_=status(i,e)
            if s=='MISSING': print('MISSING',i,e[1])
