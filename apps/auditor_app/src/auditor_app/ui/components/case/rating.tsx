import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/** 1–5 star control for rating the AI reasoning quality. */
export function Rating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Reasoning rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange(n)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star className={cn("h-6 w-6", n <= value && "fill-amber-400 text-amber-400")} />
        </button>
      ))}
      <span className="ml-2 text-sm text-muted-foreground">{value > 0 ? `${value}/5` : "Not rated"}</span>
    </div>
  );
}
