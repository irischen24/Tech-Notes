import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合併 Tailwind class，後者覆蓋前者的衝突設定。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
