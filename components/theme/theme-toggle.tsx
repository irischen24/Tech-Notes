"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  THEME_STORAGE_KEY,
  isThemePreference,
  nextThemePreference,
  resolveTheme,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils/cn";

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function applyTheme(preference: ThemePreference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(preference, prefersDark);
}

const LABELS: Record<ThemePreference, string> = {
  system: "跟隨系統",
  light: "淺色",
  dark: "深色",
};

export function ThemeToggle({ className }: { className?: string }) {
  // Server render 一律為 "system"，避免 hydration mismatch
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);

  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const cycle = useCallback(() => {
    const next = nextThemePreference(readPreference());
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 隱私模式可能無法寫入，僅套用本次頁面
    }
    applyTheme(next);
    listeners.forEach((l) => l());
  }, []);

  const Icon = preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;
  const nextLabel = LABELS[nextThemePreference(preference)];

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-full text-on-surface-variant",
        "transition-colors duration-200 hover:bg-on-surface/8 active:bg-on-surface/12",
        className,
      )}
      aria-label={`目前主題：${LABELS[preference]}，切換為${nextLabel}`}
      title={`主題：${LABELS[preference]}`}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
