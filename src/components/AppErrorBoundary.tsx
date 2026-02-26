import { Component, ReactNode } from "react";

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
    // Optional: log to Supabase / Sentry later
    // console.error("App error boundary caught:", error, info);
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