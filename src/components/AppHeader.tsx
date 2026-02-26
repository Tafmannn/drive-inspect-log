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

export const AppHeader = ({
  title,
  showBack = false,
  onBack,
  children,
}: AppHeaderProps) => {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getAllPendingUploads()
      .then((items) => {
        if (!cancelled) setPendingCount(items.length);
      })
      .catch(() => {
        // silently ignore – header shouldn't break the app
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  const handleHome = () => {
    navigate("/");
  };

  const handlePendingUploads = () => {
    navigate("/pending-uploads");
  };

  return (
    <header className="bg-app-header text-app-header-foreground px-4 py-3 flex items-center justify-between min-h-[60px]">
      <div className="flex items-center gap-3">
        {showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-app-header-foreground hover:bg-white/20 p-2 h-auto"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {title && <h1 className="text-lg font-medium truncate">{title}</h1>}
      </div>

      <div className="flex items-center gap-2">
        {children}

        {/* Brand / Home */}
        <button
          onClick={handleHome}
          className="flex flex-col items-center cursor-pointer px-2 py-1 rounded hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-app-header focus-visible:ring-white/60"
          aria-label="Go to dashboard"
          type="button"
        >
          <div className="text-lg font-bold tracking-[0.2em]">
            AXENTRA
          </div>
        </button>

        {/* Pending uploads indicator */}
        <Button
          variant="ghost"
          size="sm"
          className="text-app-header-foreground hover:bg-white/20 p-2 h-auto relative"
          onClick={handlePendingUploads}
          aria-label="Pending uploads"
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