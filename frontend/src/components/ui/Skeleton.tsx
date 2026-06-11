import clsx from "clsx";

interface SkeletonProps {
  className?: string;
  height?: number;
}

/** Shimmering placeholder block shown while panel data loads. */
export function Skeleton({ className, height }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={clsx("skeleton-shimmer rounded", className)}
      style={height != null ? { height } : undefined}
    />
  );
}
