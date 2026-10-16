"use client";

import { Skeleton } from "@heroui/react";

/** Shared shape-matched loading states — content pops in without layout shift. */

/** Row of stat cards (summary strips). */
export function StatCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading statistics" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rc-card space-y-2 p-4">
          <Skeleton className="h-7 w-2/3 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Chart block with title. */
export function ChartSkeleton({ height = 420 }: { height?: number }) {
  return (
    <div className="rc-card space-y-3 p-4" aria-label="Loading chart" aria-busy="true">
      <Skeleton className="h-4 w-48 rounded" />
      <Skeleton className="w-full rounded-md" style={{ height }} />
    </div>
  );
}

/** Table block with header + rows. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rc-card space-y-2 p-4" aria-label="Loading table" aria-busy="true">
      <div className="flex gap-2">
        {[90, 140, 110, 80].map((w, i) => (
          <Skeleton key={i} className="h-4 rounded" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded-md" />
      ))}
    </div>
  );
}

/** Stack of labeled sliders (weight / scenario panels). */
export function SliderListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="rc-card space-y-5 p-4" aria-label="Loading controls" aria-busy="true">
      <Skeleton className="h-4 w-32 rounded" />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-3.5 w-2/3 rounded" />
            <Skeleton className="h-3.5 w-10 rounded" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Full map view: controls row + map canvas + ranking list. */
export function MapSkeleton() {
  return (
    <div aria-label="Loading map" aria-busy="true">
      <div className="mb-3 flex flex-wrap gap-2">
        {[180, 90, 110, 130, 100].map((w, i) => (
          <Skeleton key={i} className="h-9 rounded-md" style={{ width: w }} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-[560px] w-full rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40 rounded" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Catalog grid (data page). */
export function CatalogSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading catalog" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rc-card space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-4 w-2/3 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  );
}

/** District drawer profile. */
export function DrawerSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading district profile" aria-busy="true">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-3 w-32 rounded" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rc-card space-y-1.5 p-3 text-center">
            <Skeleton className="mx-auto h-7 w-12 rounded-md" />
            <Skeleton className="mx-auto h-3 w-16 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-40 rounded" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-6 w-24 rounded-md" />
        ))}
      </div>
    </div>
  );
}
