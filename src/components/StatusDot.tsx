import { cn } from "@scholarkit/editor/lib/cn";
import type { Status } from "@/lib/binder";

/** A status's color, as the reading list's board shows it; hollow for none. */
export function StatusDot({
  status,
  className,
}: {
  status?: Status | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "status-dot",
        status ? `status-${status}` : "status-none",
        className,
      )}
      aria-hidden
    />
  );
}
