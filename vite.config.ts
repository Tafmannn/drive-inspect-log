import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { checkSupabaseTarget } from "./src/lib/supabaseTarget";

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  // Fail the build (not just the page) when the target project is wrong — e.g.
  // a staging branch whose own variables are missing would otherwise silently
  // fall back to the committed production .env.
  if (command === "build") {
    const env = loadEnv(mode, process.cwd(), "");
    const target = checkSupabaseTarget({
      url: env.VITE_SUPABASE_URL,
      key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      appEnv: env.VITE_APP_ENV,
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF,
      vercelEnv: process.env.VERCEL_ENV,
      allowProductionPreview: env.VITE_ALLOW_PRODUCTION_PREVIEW,
    });
    if (!target.ok) throw new Error("Supabase target check failed: " + target.errors.join("; "));
    console.log(`[supabase-target] building against project ${target.ref} (VITE_APP_ENV=${env.VITE_APP_ENV || "unset"})`);
  }
  return {
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    // Offline app shell. injectManifest (not generateSW) so the worker in
    // src/service-worker.ts stays hand-written — the push-notification
    // handlers extend the same file later. "prompt" means a new deploy never
    // silently reloads a driver; they get an in-app "Update available" prompt.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
      registerType: "prompt",
      injectRegister: false,
      // public/manifest.json (already linked from index.html) stays the
      // single source of truth — don't emit a second manifest.
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        // The jspdf/report chunks are ~400 kB; keep them precachable.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-ui": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-label",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
};
});
