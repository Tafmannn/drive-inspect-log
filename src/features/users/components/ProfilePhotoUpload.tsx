/**
 * ProfilePhotoUpload — avatar upload/preview/remove for user profile.
 *
 * Writes profile_photo_path directly to user_profiles (RLS-scoped: self,
 * or same-org admin/super-admin — see 20260317123952_...sql
 * "user_profiles_update_self_admin_super") rather than through the
 * user-lifecycle edge function, which is gated ADMIN_OR_SUPER_ADMIN_ONLY
 * for every action and would 403 a driver uploading their own photo.
 * RLS already grants exactly the scope this needs; a photo path isn't
 * sensitive enough to warrant the edge function's audit-logged path the
 * way role/status changes are.
 */
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useProfilePhotoUrl } from "@/hooks/useProfilePhoto";
import { getInitials } from "@/lib/utils";
import { Camera, Trash2, Loader2 } from "lucide-react";

interface ProfilePhotoUploadProps {
  userId: string;
  orgId: string | null;
  currentPath: string | null;
  displayName: string;
  disabled?: boolean;
}

export function ProfilePhotoUpload({ userId, orgId, currentPath, displayName, disabled }: ProfilePhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localPath, setLocalPath] = useState(currentPath);
  const queryClient = useQueryClient();

  useEffect(() => setLocalPath(currentPath), [currentPath]);

  const photoUrl = useProfilePhotoUrl(localPath);
  const initials = getInitials(displayName);

  async function handleUpload(file: File) {
    if (!orgId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${orgId}/${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({ profile_photo_path: path })
        .eq("auth_user_id", userId);
      if (updateError) throw updateError;
      setLocalPath(path);
      queryClient.invalidateQueries({ queryKey: ["user-management"] });
      queryClient.invalidateQueries({ queryKey: ["own-profile-photo-path", userId] });
    } catch (e) {
      toast({ title: "Photo upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    try {
      if (localPath) await supabase.storage.from("profile-photos").remove([localPath]);
      const { error } = await supabase
        .from("user_profiles")
        .update({ profile_photo_path: null })
        .eq("auth_user_id", userId);
      if (error) throw error;
      setLocalPath(null);
      queryClient.invalidateQueries({ queryKey: ["user-management"] });
      queryClient.invalidateQueries({ queryKey: ["own-profile-photo-path", userId] });
    } catch (e) {
      toast({ title: "Remove failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-14 w-14">
        {photoUrl && <AvatarImage src={photoUrl} alt={displayName} />}
        <AvatarFallback className="text-sm font-medium">{initials || "?"}</AvatarFallback>
      </Avatar>

      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Camera className="h-3 w-3 mr-1" />}
          {localPath ? "Replace" : "Upload"}
        </Button>
        {localPath && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2 text-destructive"
            disabled={disabled || uploading}
            onClick={handleRemove}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
