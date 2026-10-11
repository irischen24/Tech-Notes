import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("cn", () => {
  it("後面的 Tailwind class 覆蓋衝突設定", () => {
    expect(cn("px-4 text-primary", false && "hidden", "px-6")).toBe("text-primary px-6");
  });
});
