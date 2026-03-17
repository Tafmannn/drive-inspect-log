/**
 * ProfilePhotoUpload — avatar upload/preview/remove for user profile.
 */
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePhotoUrl } from "@/lib/profilePhotoUtils";
import { useUpdateProfile } from "@/hooks/useUserManagement";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  const updateMutation = useUpdateProfile();

  const photoUrl = resolveProfilePhotoUrl(currentPath);
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleUpload(file: File) {
    if (!orgId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${orgId}/${userId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("profile-photos").upload(path, file, { upsert: true });
      if (error) throw error;
      updateMutation.mutate({ userId, fields: { profile_photo_path: path } });
    } catch (e: any) {
      console.error("Photo upload failed:", e);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (currentPath) {
      await supabase.storage.from("profile-photos").remove([currentPath]);
    }
    updateMutation.mutate({ userId, fields: { profile_photo_path: null } });
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
          {currentPath ? "Replace" : "Upload"}
        </Button>
        {currentPath && (
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
