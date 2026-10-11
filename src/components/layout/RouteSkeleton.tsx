import { Skeleton } from '@/components/ui/bits';

export function RouteSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[var(--content-max)] px-4 pt-3 md:px-8 md:pt-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-8 h-10 w-56" />
      <Skeleton className="mb-6 h-[148px] w-full rounded-[18px]" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="h-10 w-10 rounded-[12px]" />
          <div className="flex-1">
            <Skeleton className="mb-2 h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
