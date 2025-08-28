import { ArrowLeft, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  children?: React.ReactNode;
}

export const AppHeader = ({ title, showBack = false, onBack, children }: AppHeaderProps) => {
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
        <div className="flex flex-col items-center">
          <div className="w-8 h-6 bg-primary rounded-sm flex items-center justify-center">
            <div className="w-6 h-4 bg-app-header rounded-xs flex items-center justify-center">
              <span className="text-primary text-xs font-bold">AM</span>
            </div>
          </div>
          <span className="text-xs mt-1">VEHICLE</span>
        </div>
        <Button 
          variant="ghost" 
          size="sm"
          className="text-app-header-foreground hover:bg-white/20 p-2 h-auto"
        >
          <Share className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
};