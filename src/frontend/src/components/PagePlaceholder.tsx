import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface PagePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  ocid: string;
}

/**
 * Shared scaffold for a workspace view. Page tasks replace the body of each
 * page while keeping this header structure.
 */
export function PagePlaceholder({
  title,
  description,
  icon: Icon,
  ocid,
}: PagePlaceholderProps) {
  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6"
      data-ocid={ocid}
    >
      <div className="mb-6 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div
        className={cn(
          "flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-border bg-card/50",
        )}
      >
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Module initializing
        </p>
      </div>
    </div>
  );
}
