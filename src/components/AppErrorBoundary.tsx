import { Component, ReactNode } from "react";
import { logClientEvent } from "@/lib/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    logClientEvent("error_boundary_caught", "error", {
      message: error instanceof Error ? error.message : String(error),
      source: "ui",
      type: "unknown",
      context: {
        stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
        componentStack: (info as any)?.componentStack?.slice(0, 500),
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="max-w-sm w-full space-y-4 text-center">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              The Axentra app hit an error while loading.
            </p>
            {this.state.message && (
              <p className="text-xs text-destructive break-words">
                {this.state.message}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg"
            >
              Reload App
            </button>
            <p className="text-xs text-muted-foreground">
              Try refreshing the preview. If this keeps happening, send this
              error text to your dev assistant.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
