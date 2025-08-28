import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count?: number;
  onClick?: () => void;
  className?: string;
}

export const DashboardCard = ({ 
  icon, 
  title, 
  subtitle, 
  count, 
  onClick, 
  className 
}: DashboardCardProps) => {
  return (
    <Card 
      className={cn(
        "p-4 cursor-pointer hover:shadow-lg transition-all duration-200 relative overflow-hidden",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
            {icon}
          </div>
          <div>
            <h3 className="font-semibold text-card-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {count !== undefined && (
          <div className="absolute right-4 top-4">
            <span className={cn(
              "inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-full text-sm font-medium",
              count > 0 ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
            )}>
              {count}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};