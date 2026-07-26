// Vitest stand-in for the build-time virtual module `virtual:pwa-register/react`
// (provided by vite-plugin-pwa in real builds; vitest runs without that
// plugin). Reports "no update waiting" and never registers anything.
import { useState } from "react";

export function useRegisterSW() {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: async () => {},
  };
}
