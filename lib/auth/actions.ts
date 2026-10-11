"use server";

import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { safeRedirectPath } from "@/lib/supabase/proxy-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { authorize } from "./authorization";
import { getAuthorization } from "./dal";
import { AUTH_MESSAGES, mapAuthError } from "./errors";

export type LoginState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  email?: string;
};

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === "email" || key === "password") && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const rawEmail = formData.get("email");
    return { fieldErrors, email: typeof rawEmail === "string" ? rawEmail.slice(0, 254) : undefined };
  }

  const { email, password, next } = parsed.data;
  const supabase = await createSupabaseServerClient();

  let signIn;
  try {
    signIn = await supabase.auth.signInWithPassword({ email, password });
  } catch {
    return { error: AUTH_MESSAGES.unavailable, email };
  }
  if (signIn.error || !signIn.data.user) {
    return { error: mapAuthError(signIn.error), email };
  }

  const userId = signIn.data.user.id;
  const { data: profile } = await supabase.from("profiles").select("id, username, role").eq("id", userId).maybeSingle();
  const auth = authorize({ id: userId, email: signIn.data.user.email ?? null }, profile ?? null);

  if (auth.status !== "admin") {
    // 本站只有管理員需要登入；非 admin 立即登出，不保留 session
    await supabase.auth.signOut();
    return { error: AUTH_MESSAGES.notAdmin, email };
  }

  await writeAuditLog(supabase, userId, { action: "auth.login", entityType: "session", result: "success" });
  redirect(safeRedirectPath(next));
}

export async function logoutAction(): Promise<void> {
  const auth = await getAuthorization();
  if (auth.status === "admin") {
    await writeAuditLog(auth.supabase, auth.user.id, { action: "auth.logout", entityType: "session", result: "success" });
  }
  if (auth.status !== "unauthenticated") {
    const { error } = await auth.supabase.auth.signOut();
    if (error) console.error("[auth] 登出失敗", { code: error.code });
  }
  redirect("/login?signed_out=1");
}
