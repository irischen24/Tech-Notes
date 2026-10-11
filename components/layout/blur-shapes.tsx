/** Organic blur shapes：純裝飾，aria-hidden，且尊重 prefers-reduced-motion（見 globals.css）。 */
export function BlurShapes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-24 -right-16 size-80 rounded-[42%_58%_63%_37%/45%_40%_60%_55%] bg-(--blob-a) opacity-60 blur-3xl motion-safe:animate-[blob-drift_18s_ease-in-out_infinite]" />
      <div className="absolute -bottom-28 left-1/4 size-72 rounded-[60%_40%_35%_65%/55%_45%_55%_45%] bg-(--blob-b) opacity-50 blur-3xl motion-safe:animate-[blob-drift_22s_ease-in-out_infinite_reverse]" />
      <div className="absolute top-1/3 -left-20 size-64 rounded-full bg-(--blob-c) opacity-70 blur-3xl" />
    </div>
  );
}
