"use client";

import { useCallback, useState } from "react";
import { StatusBanner } from "@/components/ui/status-banner";

type Feedback = { tone: "success" | "error"; message: string } | null;

/** 操作結果回饋（成功 / 失敗訊息），以 role=status / alert 讓螢幕閱讀器朗讀。 */
export function useFeedback() {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const show = useCallback((result: { ok: boolean; message?: string }, fallback = "已完成") => {
    setFeedback({ tone: result.ok ? "success" : "error", message: result.message ?? fallback });
  }, []);
  const clear = useCallback(() => setFeedback(null), []);
  const node = feedback ? <StatusBanner tone={feedback.tone} title={feedback.message} /> : null;
  return { show, clear, node };
}
