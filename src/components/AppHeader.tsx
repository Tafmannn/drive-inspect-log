import { ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getAllPendingUploads } from "@/lib/pendingUploads";

interface AppHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  children?: React.ReactNode;
}

export const AppHeader = ({ title, showBack = false, onBack, children }: AppHeaderProps) => {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getAllPendingUploads().then((items) => setPendingCount(items.length)).catch(() => {});
  }, []);

  return (
    <header className="bg-app-header text-app-header-foreground px-4 py-3 flex items-center justify-between min-h-[60px]">
      <div className="flex items-center gap-3">
        {showBack && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onBack}
            className="text-app-header-foreground hover:bg-white/20 p-2 h-auto"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {title && <h1 className="text-lg font-medium">{title}</h1>}
      </div>
      
      <div className="flex items-center gap-2">
        {children}
        <button
          onClick={() => navigate('/')}
          className="flex flex-col items-center cursor-pointer"
          aria-label="Go to dashboard"
        >
          <div className="text-lg font-bold text-app-header-foreground">
            AXENTRA
          </div>
        </button>
        <Button 
          variant="ghost" 
          size="sm"
          className="text-app-header-foreground hover:bg-white/20 p-2 h-auto relative"
          onClick={() => navigate('/pending-uploads')}
        >
          <Upload className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
};
