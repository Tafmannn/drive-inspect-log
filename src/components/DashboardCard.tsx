import { cn } from "@/lib/utils";

interface DashboardCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count?: number;
  onClick?: () => void;
  className?: string;
  iconClassName?: string;
}

export const DashboardCard = ({
  icon,
  title,
  subtitle,
  count,
  onClick,
  className,
  iconClassName,
}: DashboardCardProps) => {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 rounded-xl bg-card shadow-sm border border-border cursor-pointer active:bg-muted/50 transition-all min-h-[44px]",
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-lg bg-primary/10 text-primary",
            iconClassName
          )}
        >
          {icon}
        </div>
        <div className="flex flex-col">
          <p className="text-[16px] font-medium text-foreground">{title}</p>
          <p className="text-[14px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {count !== undefined && (
        <div
          className={cn(
            "w-7 h-7 rounded-full text-[12px] font-medium flex items-center justify-center shrink-0",
            count > 0
              ? "bg-success text-success-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {count}
        </div>
      )}
    </div>
  );
};
