import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { BottomNav } from "@/components/BottomNav";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background pb-20">
      <div className="text-center space-y-4">
        <h1 className="text-[48px] font-semibold text-foreground">404</h1>
        <p className="text-[16px] text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-[14px] text-primary hover:underline">
          Return to Home
        </a>
      </div>
      <BottomNav />
    </div>
  );
};

export default NotFound;
