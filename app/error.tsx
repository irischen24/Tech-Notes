"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-20 sm:px-6">
      <StatusBanner tone="error" title="頁面載入失敗">
        伺服器處理這個請求時發生錯誤。{error.digest ? `錯誤代碼：${error.digest}` : null}
      </StatusBanner>
      <Button onClick={() => retry()}>重新載入</Button>
    </div>
  );
}
