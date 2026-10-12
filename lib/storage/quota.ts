/**
 * 容量警告等級（純函式）。
 * 額度由管理員自行設定；未設定時不計算百分比，也不顯示任何剩餘量。
 */
export type Thresholds = { notice: number; warning: number; critical: number };
export const DEFAULT_THRESHOLDS: Thresholds = { notice: 70, warning: 85, critical: 95 };

export type UsageLevel = "unset" | "ok" | "notice" | "warning" | "critical" | "over";

export type Usage = { usedBytes: number; quotaBytes: number | null; percent: number | null; level: UsageLevel };

export function computeUsage(usedBytes: number, quotaBytes: number | null, t: Thresholds = DEFAULT_THRESHOLDS): Usage {
  const used = Math.max(0, usedBytes);
  if (!quotaBytes || quotaBytes <= 0) return { usedBytes: used, quotaBytes: null, percent: null, level: "unset" };
  const percent = (used / quotaBytes) * 100;
  const level: UsageLevel =
    percent > 100 ? "over" : percent >= t.critical ? "critical" : percent >= t.warning ? "warning" : percent >= t.notice ? "notice" : "ok";
  return { usedBytes: used, quotaBytes, percent, level };
}

export const LEVEL_LABEL: Record<UsageLevel, string> = {
  unset: "尚未設定額度",
  ok: "正常",
  notice: "提醒",
  warning: "警告",
  critical: "嚴重警告",
  over: "已超過額度",
};

/** 等級是否需要在後台主動提示（提醒以上）。 */
export function needsAttention(level: UsageLevel): boolean {
  return level === "notice" || level === "warning" || level === "critical" || level === "over";
}
