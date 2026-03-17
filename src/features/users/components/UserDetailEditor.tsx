/**
 * UserDetailEditor — full user profile editor with lifecycle controls.
 */
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  useUserDetail, useUpdateProfile, useUpdateDriverProfile, useSetUserRole,
  useActivateUser, useSuspendUser, useReactivateUser, useArchiveDriver, useRestoreDriver,
} from "@/hooks/useUserManagement";
import type { UserProfile } from "@/lib/userLifecycleApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountStatusBadge, RoleBadge, ArchivedBadge } from "./UserStatusBadge";
import { PermissionEditor } from "./PermissionEditor";
import { ProfilePhotoUpload } from "./ProfilePhotoUpload";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Save, Shield, ShieldOff, Archive, RotateCcw, UserCheck } from "lucide-react";

interface UserDetailEditorProps {
  userId: string;
  onBack: () => void;
}

export function UserDetailEditor({ userId, onBack }: UserDetailEditorProps) {
  const { isSuperAdmin } = useAuth();
  const { data: user, isLoading } = useUserDetail(userId);
  const updateMutation = useUpdateProfile();
  const updateDriverMutation = useUpdateDriverProfile();
  const setRoleMutation = useSetUserRole();
  const activateMutation = useActivateUser();
  const suspendMutation = useSuspendUser();
  const reactivateMutation = useReactivateUser();
  const archiveMutation = useArchiveDriver();
  const restoreMutation = useRestoreDriver();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    display_name: "",
    phone: "",
    internal_notes: "",
  });

  const [driverForm, setDriverForm] = useState<Record<string, string>>({});
  const [suspendReason, setSuspendReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [restoreNote, setRestoreNote] = useState("");
  const [restoreReactivate, setRestoreReactivate] = useState(true);
  const [selectedRole, setSelectedRole] = useState("");

  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name ?? "",
        last_name: user.last_name ?? "",
        display_name: user.display_name ?? "",
        phone: user.phone ?? "",
        internal_notes: user.internal_notes ?? "",
      });
      setSelectedRole(user.role);
      const dp = user.driver_profiles?.[0];
      if (dp) {
        setDriverForm({
          full_name: dp.full_name ?? "",
          licence_number: dp.licence_number ?? "",
          licence_expiry: dp.licence_expiry ?? "",
          date_of_birth: dp.date_of_birth ?? "",
          address_line1: dp.address_line1 ?? "",
          address_line2: dp.address_line2 ?? "",
          city: dp.city ?? "",
          postcode: dp.postcode ?? "",
          emergency_contact_name: dp.emergency_contact_name ?? "",
          emergency_contact_phone: dp.emergency_contact_phone ?? "",
          trade_plate_number: dp.trade_plate_number ?? "",
          employment_type: dp.employment_type ?? "contractor",
          notes: dp.notes ?? "",
          phone: dp.phone ?? "",
        });
      }
    }
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const dp = user.driver_profiles?.[0];
  const isArchived = !!dp?.archived_at;
  const isProtected = user.is_protected;
  const canEdit = !isProtected || isSuperAdmin;
  const isMutating =
    updateMutation.isPending || updateDriverMutation.isPending || setRoleMutation.isPending ||
    activateMutation.isPending || suspendMutation.isPending || reactivateMutation.isPending ||
    archiveMutation.isPending || restoreMutation.isPending;

  const displayName = user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email.split("@")[0];

  const handleSave = () => {
    updateMutation.mutate({ userId, fields: form });
  };

  const handleDriverSave = () => {
    updateDriverMutation.mutate({ userId, fields: driverForm });
  };

  const handleRoleChange = () => {
    if (selectedRole !== user.role) {
      setRoleMutation.mutate({ userId, role: selectedRole });
    }
  };

  const setDriverField = (key: string, value: string) => {
    setDriverForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold truncate">{displayName}</h2>
            <RoleBadge role={user.role} />
            <AccountStatusBadge status={user.account_status} />
            {isArchived && <ArchivedBadge />}
            {isProtected && <span className="text-xs text-amber-600">🔒 Protected</span>}
          </div>
          <p className="text-[10px] text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Profile Photo */}
      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-xs font-semibold text-foreground mb-3">Photo</h3>
        <ProfilePhotoUpload
          userId={userId}
          orgId={user.org_id}
          currentPath={user.profile_photo_path}
          displayName={displayName}
          disabled={!canEdit}
        />
      </section>

      {/* Identity Section */}
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-foreground">Identity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px]">First Name</Label>
            <Input className="h-8 text-xs mt-1" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} disabled={!canEdit} />
          </div>
          <div>
            <Label className="text-[11px]">Last Name</Label>
            <Input className="h-8 text-xs mt-1" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} disabled={!canEdit} />
          </div>
          <div>
            <Label className="text-[11px]">Display Name</Label>
            <Input className="h-8 text-xs mt-1" value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} disabled={!canEdit} />
          </div>
          <div>
            <Label className="text-[11px]">Phone</Label>
            <Input className="h-8 text-xs mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} disabled={!canEdit} />
          </div>
        </div>
        <div>
          <Label className="text-[11px]">Internal Notes</Label>
          <Textarea className="text-xs mt-1 min-h-[60px]" value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} disabled={!canEdit} />
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={isMutating || !canEdit}>
          {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save Identity
        </Button>
      </section>

      {/* Role Section */}
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-foreground">Role</h3>
        <div className="flex items-center gap-2">
          <Select value={selectedRole} onValueChange={setSelectedRole} disabled={!canEdit}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="driver">Driver</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleRoleChange} disabled={isMutating || selectedRole === user.role || !canEdit}>
            Apply Role
          </Button>
        </div>
      </section>

      {/* Permissions Section */}
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-foreground">Permissions</h3>
        <PermissionEditor userId={userId} userRole={user.role} />
      </section>

      {/* Account Access Section */}
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-foreground">Account Access</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Current: <AccountStatusBadge status={user.account_status} />
        </div>

        <div className="flex flex-wrap gap-2">
          {user.account_status === "pending_activation" && (
            <ConfirmAction
              title="Activate User"
              description="This will allow the user to access the application."
              trigger={<Button size="sm" className="h-7 text-xs" disabled={isMutating}><UserCheck className="h-3 w-3 mr-1" /> Activate</Button>}
              onConfirm={() => activateMutation.mutate(userId)}
            />
          )}

          {user.account_status === "active" && !isProtected && (
            <ConfirmActionWithInput
              title="Suspend User"
              description="This will block the user from accessing the application."
              inputLabel="Reason (optional)"
              inputValue={suspendReason}
              onInputChange={setSuspendReason}
              trigger={<Button size="sm" variant="destructive" className="h-7 text-xs" disabled={isMutating}><ShieldOff className="h-3 w-3 mr-1" /> Suspend</Button>}
              onConfirm={() => { suspendMutation.mutate({ userId, reason: suspendReason || undefined }); setSuspendReason(""); }}
            />
          )}

          {user.account_status === "suspended" && (
            <ConfirmAction
              title="Reactivate User"
              description="This will restore the user's access to the application."
              trigger={<Button size="sm" variant="outline" className="h-7 text-xs" disabled={isMutating}><Shield className="h-3 w-3 mr-1" /> Reactivate</Button>}
              onConfirm={() => reactivateMutation.mutate(userId)}
            />
          )}
        </div>

        {user.suspended_at && (
          <p className="text-[10px] text-muted-foreground">
            Suspended: {new Date(user.suspended_at).toLocaleDateString()}
            {user.suspension_reason && ` — ${user.suspension_reason}`}
          </p>
        )}
      </section>

      {/* Driver Section */}
      {user.role === "driver" && dp && (
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold text-foreground">Driver Profile</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Full Name</Label>
              <Input className="h-8 text-xs mt-1" value={driverForm.full_name ?? ""} onChange={(e) => setDriverField("full_name", e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label className="text-[11px]">Phone</Label>
              <Input className="h-8 text-xs mt-1" value={driverForm.phone ?? ""} onChange={(e) => setDriverField("phone", e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label className="text-[11px]">Licence Number</Label>
              <Input className="h-8 text-xs mt-1" value={driverForm.licence_number ?? ""} onChange={(e) => setDriverField("licence_number", e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label className="text-[11px]">Licence Expiry</Label>
              <Input type="date" className="h-8 text-xs mt-1" value={driverForm.licence_expiry ?? ""} onChange={(e) => setDriverField("licence_expiry", e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label className="text-[11px]">Date of Birth</Label>
              <Input type="date" className="h-8 text-xs mt-1" value={driverForm.date_of_birth ?? ""} onChange={(e) => setDriverField("date_of_birth", e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label className="text-[11px]">Employment Type</Label>
              <Select value={driverForm.employment_type ?? "contractor"} onValueChange={(v) => setDriverField("employment_type", v)} disabled={!canEdit}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="agency">Agency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Trade Plate Number</Label>
              <Input className="h-8 text-xs mt-1" value={driverForm.trade_plate_number ?? ""} onChange={(e) => setDriverField("trade_plate_number", e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label className="text-[11px]">Active</Label>
              <p className="text-xs mt-1">{dp.is_active ? "Yes" : "No"}</p>
            </div>
          </div>

          {/* Address */}
          <div className="pt-2 border-t space-y-2">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Address</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Address Line 1</Label>
                <Input className="h-8 text-xs mt-1" value={driverForm.address_line1 ?? ""} onChange={(e) => setDriverField("address_line1", e.target.value)} disabled={!canEdit} />
              </div>
              <div>
                <Label className="text-[11px]">Address Line 2</Label>
                <Input className="h-8 text-xs mt-1" value={driverForm.address_line2 ?? ""} onChange={(e) => setDriverField("address_line2", e.target.value)} disabled={!canEdit} />
              </div>
              <div>
                <Label className="text-[11px]">City</Label>
                <Input className="h-8 text-xs mt-1" value={driverForm.city ?? ""} onChange={(e) => setDriverField("city", e.target.value)} disabled={!canEdit} />
              </div>
              <div>
                <Label className="text-[11px]">Postcode</Label>
                <Input className="h-8 text-xs mt-1" value={driverForm.postcode ?? ""} onChange={(e) => setDriverField("postcode", e.target.value)} disabled={!canEdit} />
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="pt-2 border-t space-y-2">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Emergency Contact</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Name</Label>
                <Input className="h-8 text-xs mt-1" value={driverForm.emergency_contact_name ?? ""} onChange={(e) => setDriverField("emergency_contact_name", e.target.value)} disabled={!canEdit} />
              </div>
              <div>
                <Label className="text-[11px]">Phone</Label>
                <Input className="h-8 text-xs mt-1" value={driverForm.emergency_contact_phone ?? ""} onChange={(e) => setDriverField("emergency_contact_phone", e.target.value)} disabled={!canEdit} />
              </div>
            </div>
          </div>

          {/* Driver Notes */}
          <div>
            <Label className="text-[11px]">Driver Notes</Label>
            <Textarea className="text-xs mt-1 min-h-[50px]" value={driverForm.notes ?? ""} onChange={(e) => setDriverField("notes", e.target.value)} disabled={!canEdit} />
          </div>

          <Button size="sm" className="h-7 text-xs" onClick={handleDriverSave} disabled={isMutating || !canEdit}>
            {updateDriverMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Save Driver Profile
          </Button>

          {/* Archive / Restore */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {!isArchived ? (
              <ConfirmActionWithInput
                title="Archive Driver"
                description="This will remove the driver from active operations and suspend their account. Historical data is preserved."
                inputLabel="Reason"
                inputValue={archiveReason}
                onInputChange={setArchiveReason}
                trigger={<Button size="sm" variant="outline" className="h-7 text-xs text-destructive" disabled={isMutating}><Archive className="h-3 w-3 mr-1" /> Archive Driver</Button>}
                onConfirm={() => { archiveMutation.mutate({ userId, reason: archiveReason || undefined }); setArchiveReason(""); }}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  Archived: {dp.archived_at ? new Date(dp.archived_at).toLocaleDateString() : "—"}
                  {dp.archive_reason && ` — ${dp.archive_reason}`}
                </p>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px]">
                    <input type="checkbox" checked={restoreReactivate} onChange={(e) => setRestoreReactivate(e.target.checked)} className="h-3 w-3" />
                    Also reactivate account
                  </label>
                </div>
                <ConfirmActionWithInput
                  title="Restore Driver"
                  description="This will return the driver to active operations."
                  inputLabel="Note (optional)"
                  inputValue={restoreNote}
                  onInputChange={setRestoreNote}
                  trigger={<Button size="sm" variant="outline" className="h-7 text-xs" disabled={isMutating}><RotateCcw className="h-3 w-3 mr-1" /> Restore Driver</Button>}
                  onConfirm={() => { restoreMutation.mutate({ userId, reactivate: restoreReactivate, note: restoreNote || undefined }); setRestoreNote(""); }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Timestamps */}
      <section className="rounded-lg border bg-card p-4 space-y-1">
        <h3 className="text-xs font-semibold text-foreground mb-2">Activity</h3>
        <p className="text-[10px] text-muted-foreground">Created: {new Date(user.created_at).toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground">Updated: {new Date(user.updated_at).toLocaleString()}</p>
        {user.activated_at && <p className="text-[10px] text-muted-foreground">Activated: {new Date(user.activated_at).toLocaleString()}</p>}
      </section>
    </div>
  );
}

/* ── Confirm dialogs ── */

function ConfirmAction({ title, description, trigger, onConfirm }: {
  title: string; description: string; trigger: React.ReactNode; onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
          <AlertDialogAction className="h-8 text-xs" onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmActionWithInput({ title, description, inputLabel, inputValue, onInputChange, trigger, onConfirm }: {
  title: string; description: string; inputLabel: string; inputValue: string; onInputChange: (v: string) => void; trigger: React.ReactNode; onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Label className="text-[11px]">{inputLabel}</Label>
          <Input className="h-8 text-xs mt-1" value={inputValue} onChange={(e) => onInputChange(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
          <AlertDialogAction className="h-8 text-xs" onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
