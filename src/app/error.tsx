"use client";

import { EmptyState } from "@/components/ui";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <EmptyState
      title="Something went wrong loading this page"
      action={
        <button onClick={() => retry()} className="h-7 border border-line px-3 text-[12px] hover:border-accent">
          Try again
        </button>
      }
    >
      The data service may be unavailable. No partial or cached figures are shown in its place.
      {error.digest && <span className="num mt-1 block text-[11px]">ref {error.digest}</span>}
    </EmptyState>
  );
}
