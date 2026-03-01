import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

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

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <header className="px-4 py-3 border-b border-border bg-card flex items-center justify-between min-h-[56px] sticky top-0 z-40">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={handleBack}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Go back"
            type="button"
          >
            <ArrowLeft className="w-6 h-6 stroke-[2]" />
          </button>
        )}
        {title && (
          <h1 className="text-[20px] font-semibold text-foreground truncate">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
      </div>
    </header>
  );
};
