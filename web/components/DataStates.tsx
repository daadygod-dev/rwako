"use client";

import { ApiError } from "@/lib/api";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const detail = error instanceof ApiError ? error.detail : String(error);
  return (
    <div className="rc-card p-5">
      <p className="font-medium">Request failed</p>
      <p className="mt-1 text-sm rc-muted">{detail}</p>
      <button className="mt-3 rounded-md px-3 py-1.5 text-sm" style={{ background: "var(--rc-accent)", color: "var(--rc-accent-foreground)" }} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/** Honest empty state — points at the real fix, never mocks data. */
export function DataNeeded({ reason, action }: { reason: string; action?: string }) {
  return (
    <div className="rc-card p-6">
      <p className="font-semibold">Data needed</p>
      <p className="mt-1 text-sm rc-muted">{reason}</p>
      {action ? <p className="mt-2 text-sm rc-muted">{action}</p> : null}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      {subtitle ? <p className="text-sm rc-muted">{subtitle}</p> : null}
    </div>
  );
}
