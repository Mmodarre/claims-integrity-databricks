import type { ReactNode } from "react";
import { Suspense } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";

import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: unknown } | null;
    const detail = body && typeof body === "object" ? body.detail : undefined;
    if (typeof detail === "string") return detail;
    return `${error.status} ${error.statusText}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Suspense + error boundary scaffold for data-fetching subtrees. */
export function QueryBoundary({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ error, resetErrorBoundary }) => (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Something went wrong</p>
              <p className="mt-1 break-words text-muted-foreground">{errorMessage(error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={resetErrorBoundary}>
                Try again
              </Button>
            </div>
          )}
        >
          <Suspense fallback={fallback ?? <Skeleton className="h-48 w-full" />}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
