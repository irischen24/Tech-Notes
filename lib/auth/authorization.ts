import type { ProfileRole } from "@/types/database";

export type AuthUser = { id: string; email: string | null };
export type AuthProfile = { id: string; username: string; role: ProfileRole };

export type AuthorizationResult =
  | { status: "unauthenticated" }
  | { status: "forbidden"; user: AuthUser; profile: AuthProfile | null }
  | { status: "admin"; user: AuthUser; profile: AuthProfile };

/** 純函式：依登入使用者與資料庫 profile 決定授權結果（角色只信任資料庫）。 */
export function authorize(user: AuthUser | null, profile: AuthProfile | null): AuthorizationResult {
  if (!user) return { status: "unauthenticated" };
  if (!profile || profile.id !== user.id || profile.role !== "admin") {
    return { status: "forbidden", user, profile };
  }
  return { status: "admin", user, profile };
}

export const HTTP_FOR_AUTHORIZATION = { unauthenticated: 401, forbidden: 403 } as const;
