import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found");
}

function BootFailure({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <section className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Axentra could not open</h1>
        <p className="text-sm text-muted-foreground">
          The app failed during startup before the normal screen could load.
        </p>
        <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted p-3 text-left text-xs text-destructive whitespace-pre-wrap">
          {message}
          {stack ? `\n\n${stack}` : ""}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Reload
        </button>
      </section>
    </main>
  );
}

const root = createRoot(container);

async function bootstrap() {
  try {
    const logger = await import("@/lib/logger").catch((error) => {
      console.warn("Axentra logger failed to load", error);
      return null;
    });
    logger?.installGlobalErrorHandlers();

    const flags = await import("@/lib/featureFlags").catch((error) => {
      console.warn("Axentra feature flags failed to load", error);
      return null;
    });
    try {
      flags?.preloadFlags();
    } catch (error) {
      console.warn("Axentra feature flags failed to preload", error);
    }

    const { default: App } = await import("./App");

    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Axentra startup failed", error);
    root.render(
      <React.StrictMode>
        <BootFailure error={error} />
      </React.StrictMode>
    );
  }
}

void bootstrap();
