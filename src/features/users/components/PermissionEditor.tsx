/**
 * PermissionEditor — grouped permission toggle UI for admin/super admin.
 */
import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePermissions, useSetPermissionOverride } from "@/hooks/useUserManagement";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface PermissionEditorProps {
  userId: string;
  userRole: string;
}

type EffectiveState = "allow" | "deny" | "default_allow" | "default_deny";

export function PermissionEditor({ userId, userRole }: PermissionEditorProps) {
  const { isSuperAdmin } = useAuth();
  const { data, isLoading } = usePermissions(userId);
  const setOverrideMutation = useSetPermissionOverride();

  const grouped = useMemo(() => {
    if (!data) return {};
    const groups: Record<string, Array<{
      key: string;
      label: string;
      description: string | null;
      is_sensitive: boolean;
      roleDefault: boolean;
      override: { grant_type: string } | null;
      effective: EffectiveState;
    }>> = {};

    for (const perm of data.catalog) {
      // Non-super admins can't see sensitive permissions
      if (!isSuperAdmin && perm.is_sensitive) continue;

      const roleDefault = data.role_defaults[perm.key] ?? false;
      const override = data.overrides[perm.key] ?? null;

      let effective: EffectiveState;
      if (override) {
        effective = override.grant_type === "allow" ? "allow" : "deny";
      } else {
        effective = roleDefault ? "default_allow" : "default_deny";
      }

      if (!groups[perm.category]) groups[perm.category] = [];
      groups[perm.category].push({
        key: perm.key,
        label: perm.label,
        description: perm.description,
        is_sensitive: perm.is_sensitive,
        roleDefault,
        override,
        effective,
      });
    }

    return groups;
  }, [data, isSuperAdmin]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const categories = Object.keys(grouped).sort();

  function handleChange(permKey: string, value: string) {
    setOverrideMutation.mutate({
      userId,
      permissionKey: permKey,
      grantType: value as "allow" | "deny" | "default",
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground">
        Role defaults for <span className="font-medium">{userRole}</span>. Override per-user below.
      </p>

      {categories.map((cat) => (
        <div key={cat} className="space-y-1.5">
          <h4 className="text-[11px] font-semibold text-foreground capitalize">{cat.replace(/_/g, " ")}</h4>
          <div className="space-y-1">
            {grouped[cat].map((perm) => {
              const currentValue = perm.override ? perm.override.grant_type : "default";

              return (
                <div
                  key={perm.key}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-foreground">{perm.label}</span>
                      {perm.is_sensitive && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-amber-600 border-amber-300">
                          sensitive
                        </Badge>
                      )}
                      <EffectiveBadge state={perm.effective} />
                    </div>
                    {perm.description && (
                      <p className="text-[9px] text-muted-foreground truncate">{perm.description}</p>
                    )}
                  </div>

                  <Select
                    value={currentValue}
                    onValueChange={(v) => handleChange(perm.key, v)}
                    disabled={setOverrideMutation.isPending}
                  >
                    <SelectTrigger className="h-6 w-[90px] text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default" className="text-[10px]">
                        Default ({perm.roleDefault ? "✓" : "✗"})
                      </SelectItem>
                      <SelectItem value="allow" className="text-[10px]">Allow</SelectItem>
                      <SelectItem value="deny" className="text-[10px]">Deny</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function EffectiveBadge({ state }: { state: EffectiveState }) {
  const config: Record<EffectiveState, { label: string; className: string }> = {
    allow: { label: "✓ Allowed", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    deny: { label: "✗ Denied", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    default_allow: { label: "✓ Role", className: "bg-muted text-muted-foreground" },
    default_deny: { label: "✗ Role", className: "bg-muted text-muted-foreground" },
  };
  const c = config[state];
  return (
    <span className={`text-[8px] px-1 py-0 rounded font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}
