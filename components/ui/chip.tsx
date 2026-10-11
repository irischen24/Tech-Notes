import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type ChipProps = ComponentProps<"span"> & { tone?: "neutral" | "primary" | "tertiary" };

const tones = {
  neutral: "border border-outline-variant text-on-surface-variant",
  primary: "bg-secondary-container text-on-secondary-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
} as const;

export function Chip({ tone = "neutral", className, ...props }: ChipProps) {
  return (
    <span
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 type-label [&_svg]:size-4", tones[tone], className)}
      {...props}
    />
  );
}
