export function OrdersLoadingSkeleton() {
  return (
    <div className="space-y-4 p-4 sm:p-6" aria-label="Loading orders" aria-busy="true">
      <div className="flex items-center justify-between gap-3 border-b border-line/70 pb-3">
        <div className="space-y-2">
          <div className="h-3 w-16 animate-pulse rounded bg-foreground/10" />
          <div className="h-4 w-56 animate-pulse rounded bg-foreground/10" />
        </div>
        <div className="h-9 w-40 animate-pulse rounded-lg bg-foreground/10" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-foreground/10" />
            <div className="h-7 w-52 animate-pulse rounded bg-foreground/10" />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="h-11 w-72 animate-pulse rounded-lg bg-foreground/10" />
            <div className="h-11 w-44 animate-pulse rounded-lg bg-foreground/10" />
            <div className="h-11 w-40 animate-pulse rounded-lg bg-foreground/10" />
            <div className="h-11 w-28 animate-pulse rounded-lg bg-foreground/10" />
          </div>
        </div>

        <div className="rounded-lg border border-line/80 bg-panel/55 p-2 sm:p-3">
          <div className="grid min-w-full grid-flow-col auto-cols-[minmax(224px,85vw)] gap-3 sm:auto-cols-[minmax(248px,1fr)]">
            {Array.from({ length: 5 }).map((_, columnIndex) => (
              <div key={columnIndex} className="min-w-[224px] overflow-hidden rounded-xl border border-line/70 bg-panel/90 sm:min-w-[248px]">
                <div className="h-[3px] w-full animate-pulse bg-foreground/10" />
                <div className="p-3">
                  <div className="mb-3 flex items-center justify-between border-b border-line/70 pb-3">
                    <div className="space-y-2">
                      <div className="h-2 w-12 animate-pulse rounded bg-foreground/10" />
                      <div className="h-4 w-28 animate-pulse rounded bg-foreground/10" />
                      <div className="h-3 w-20 animate-pulse rounded bg-foreground/10" />
                    </div>
                    <div className="h-6 w-8 animate-pulse rounded-full bg-foreground/10" />
                  </div>
                  <div className="space-y-2.5">
                    {Array.from({ length: 2 }).map((__, orderIndex) => (
                      <div key={orderIndex} className="rounded-lg border border-line/70 bg-black/[0.08] p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-2">
                            <div className="h-4 w-28 animate-pulse rounded bg-foreground/10" />
                            <div className="h-2.5 w-20 animate-pulse rounded bg-foreground/10" />
                          </div>
                          <div className="h-5 w-16 animate-pulse rounded-full bg-foreground/10" />
                        </div>
                        <div className="mt-4 h-3 w-32 animate-pulse rounded bg-foreground/10" />
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="h-10 animate-pulse rounded bg-foreground/10" />
                          <div className="h-10 animate-pulse rounded bg-foreground/10" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
