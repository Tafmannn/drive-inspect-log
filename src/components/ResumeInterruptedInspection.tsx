/**
 * If Android closed the app while a driver was mid-inspection (typically
 * while the camera was open), the installed app reopens on the home page.
 * On start-up, send the same signed-in driver straight back to that
 * inspection; its draft and photos are restored there automatically.
 *
 * Runs once per app start, only when the app opened on the home page, and
 * only after sign-in has resolved. See lib/activeInspection.ts.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { readInterruptedInspection } from "@/lib/activeInspection";

export function ResumeInterruptedInspection() {
  const { authLoading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const startPath = useRef(location.pathname);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || authLoading) return;
    done.current = true;
    // Only when the app itself started on the home page — never hijack a
    // deep link or a page the driver chose.
    if (startPath.current !== "/" || location.pathname !== "/") return;
    const path = readInterruptedInspection(user?.id ?? null);
    if (path) navigate(path, { replace: true, state: { resumeAfterRestart: true } });
  }, [authLoading, user?.id, location.pathname, navigate]);

  return null;
}
