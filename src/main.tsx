import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGlobalErrorHandlers } from "@/lib/logger";
import { preloadFlags } from "@/lib/featureFlags";

installGlobalErrorHandlers();
preloadFlags();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
