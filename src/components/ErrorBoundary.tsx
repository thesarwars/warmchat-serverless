import React, { useState } from "react";
import { AlertCircle, ChevronRight, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({
  error,
  onReload,
}: {
  error: Error | null;
  onReload: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const detail = error
    ? `${error.name}: ${error.message}\n\n${error.stack ?? ""}`.trim()
    : "";

  // A normal reload re-reads the browser's disk cache, so if a stale/poisoned
  // bundle is cached it keeps failing. A hard refresh bypasses the cache and is
  // the reliable escape - show the right shortcut for the user's OS.
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
  const hardReloadHint = isMac ? "Cmd + Shift + R" : "Ctrl + Shift + R";

  const handleCopy = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: select the pre text
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gray-50 px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-orange-500 shrink-0" />
          Looks like the app just got an update
        </h1>
        <p className="max-w-md text-sm text-gray-600">
          This is usually caused by a recent deployment. A quick refresh should
          fix it right away.
        </p>
      </div>

      <button
        onClick={onReload}
        className="rounded-md bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600 active:bg-orange-700 transition-colors"
      >
        Try refreshing
      </button>

      <p className="max-w-md text-xs text-gray-500">
        Still seeing this after refreshing? Do a hard reload to bypass the cache:
        press{" "}
        <kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">
          {hardReloadHint}
        </kbd>
        .
      </p>

      {detail ? (
        <details className="w-full max-w-2xl text-center group">
          <summary className="cursor-pointer select-none text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700 transition-colors list-none inline-flex items-center gap-1.5 mx-auto">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Still running into issues? View details
            <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-3 rounded-md border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-medium text-gray-500">Error details</span>
              <button
                onClick={handleCopy}
                className="text-xs text-gray-500 hover:text-gray-800 transition-colors px-2 py-1 rounded hover:bg-gray-100"
              >
                {copied ? "Copied!" : "Copy error"}
              </button>
            </div>
            <pre className="max-h-72 overflow-auto p-4 text-xs leading-5 whitespace-pre-wrap text-gray-700 font-mono">
              {detail}
            </pre>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            If this keeps happening, copy the error above and{" "}
            <a
              href="/support"
              className="text-orange-500 hover:underline"
            >
              contact support
            </a>
            .
          </p>
        </details>
      ) : null}
    </div>
  );
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <ErrorFallback error={this.state.error} onReload={this.handleReload} />
    );
  }
}

export default ErrorBoundary;
