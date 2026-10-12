import "server-only";
import { MAGIC_BYTES_LENGTH } from "./images";

/**
 * 讀取遠端檔案開頭幾個位元組（用於驗證魔術位元組）。
 * 先送 Range 請求；伺服器若忽略 Range，也只讀第一個區塊後立即取消，不下載整個檔案。
 */
export async function fetchLeadingBytes(url: string, length = MAGIC_BYTES_LENGTH, timeoutMs = 10_000): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { Range: `bytes=0-${length - 1}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const out = new Uint8Array(length);
  let filled = 0;
  try {
    while (filled < length) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const take = Math.min(value.length, length - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return out.subarray(0, filled);
}
