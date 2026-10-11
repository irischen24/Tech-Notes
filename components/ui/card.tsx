import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type CardVariant = "filled" | "elevated" | "outlined";

const variants: Record<CardVariant, string> = {
  filled: "bg-surface-container",
  elevated: "bg-surface-container-high shadow-(--shadow-elevation-1)",
  outlined: "border border-outline-variant bg-surface",
};

type CardProps = ComponentProps<"div"> & {
  variant?: CardVariant;
  /** 可互動卡片才加 hover elevation，避免靜態內容看起來可點擊 */
  interactive?: boolean;
};

export function Card({ variant = "filled", interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-(--radius-card) p-6 text-on-surface",
        variants[variant],
        interactive &&
          "transition-[box-shadow,transform] duration-200 ease-(--ease-emphasized) hover:-translate-y-0.5 hover:shadow-(--shadow-elevation-2)",
        className,
      )}
      {...props}
    />
  );
}
