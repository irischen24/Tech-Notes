import { describe, expect, it } from "vitest";
import { isThemePreference, nextThemePreference, resolveTheme, themeInitScript } from "@/lib/theme";

describe("theme", () => {
  it("system 依系統偏好決定", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("依序循環 system → light → dark", () => {
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });

  it("只接受合法值", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("<script>")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("初始化腳本不含 </script> 等可跳脫內容", () => {
    expect(themeInitScript).not.toMatch(/<\/script/i);
  });
});
