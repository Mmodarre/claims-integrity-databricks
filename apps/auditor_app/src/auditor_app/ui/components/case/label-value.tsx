import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Field = { label: string; value: ReactNode; full?: boolean };

/** Responsive label-over-value grid used throughout the claim detail sections. */
export function LabelValueGrid({ fields, className }: { fields: Field[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {fields.map((f) => (
        <div key={f.label} className={cn("min-w-0", f.full && "col-span-2 sm:col-span-3 lg:col-span-4")}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{f.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
