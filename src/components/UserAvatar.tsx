import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfilePhotoUrl } from "@/hooks/useProfilePhoto";
import { cn, getInitials } from "@/lib/utils";

interface UserAvatarProps {
  photoPath: string | null | undefined;
  name: string;
  className?: string;
}

export function UserAvatar({ photoPath, name, className }: UserAvatarProps) {
  const url = useProfilePhotoUrl(photoPath);
  const initials = getInitials(name);

  return (
    <Avatar className={cn("h-8 w-8", className)}>
      {url && <AvatarImage src={url} alt={name} />}
      <AvatarFallback className="text-xs font-medium">{initials || "?"}</AvatarFallback>
    </Avatar>
  );
}
