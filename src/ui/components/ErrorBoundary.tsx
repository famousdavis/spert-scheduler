import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary component that catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the entire app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
            <div className="text-center">
              <h1 className="text-xl font-bold text-red-600">
                Something went wrong
              </h1>
              <p className="mt-2 text-gray-600">
                Please refresh the page to continue.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Refresh Page
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
