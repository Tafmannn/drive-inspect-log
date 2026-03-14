import { cn } from "@/lib/utils";

export function ControlPageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-1 overflow-y-auto p-6 lg:p-8", className)}>
      <div className="mx-auto max-w-[1600px]">{children}</div>
    </div>
  );
}
