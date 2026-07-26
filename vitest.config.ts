import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Dummy Supabase env so `src/integrations/supabase/client.ts` constructs
    // without throwing during module load. Tests that exercise Supabase mock
    // the client; these values never reach the network. Without them, any test
    // that transitively imports the client fails to collect from a clean
    // checkout (no live network calls are made — see evidence-pipeline-fixes
    // and pending-uploads specs which mock `@/integrations/supabase/client`).
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
    },
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text"],
      reportsDirectory: "./coverage",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Build-time virtual module from vite-plugin-pwa; tests run without
      // that plugin, so resolve it to an inert stub.
      "virtual:pwa-register/react": path.resolve(
        __dirname,
        "./src/test/stubs/pwa-register-react.ts",
      ),
    },
  },
});
