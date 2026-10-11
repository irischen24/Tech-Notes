import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-full type-label whitespace-nowrap " +
  "transition-[background-color,box-shadow,color] duration-200 ease-(--ease-emphasized) " +
  "disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  filled:
    "bg-primary text-on-primary hover:shadow-(--shadow-elevation-1) hover:bg-[color-mix(in_srgb,var(--md-primary)_92%,var(--md-on-primary))]",
  tonal:
    "bg-secondary-container text-on-secondary-container hover:shadow-(--shadow-elevation-1) hover:bg-[color-mix(in_srgb,var(--md-secondary-container)_92%,var(--md-on-secondary-container))]",
  outlined: "border border-outline text-primary hover:bg-primary/8",
  text: "text-primary hover:bg-primary/8",
  danger: "bg-error text-on-error hover:shadow-(--shadow-elevation-1)",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-4 [&_svg]:size-4",
  md: "h-10 px-6 [&_svg]:size-[18px]",
  lg: "h-14 px-8 text-base [&_svg]:size-5",
};

export function buttonClasses(variant: ButtonVariant = "filled", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant = "filled", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize };

export function ButtonLink({ variant = "filled", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
