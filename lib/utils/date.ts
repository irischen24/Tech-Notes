const formatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** 以台灣時區顯示日期；無效值回傳 null。 */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : formatter.format(d);
}
