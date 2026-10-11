import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBanner } from "@/components/ui/status-banner";
import { getAuthorization } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/supabase/proxy-session";

export const metadata: Metadata = {
  title: "管理員登入",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:py-24">
      <h1 className="type-headline text-on-surface">管理員登入</h1>
      <p className="type-body mt-2 text-on-surface-variant">登入後可以新增、編輯與發布筆記。</p>
      <div className="mt-8 rounded-(--radius-card) bg-surface-container p-6 sm:p-8">
        <Suspense fallback={<LoginSkeleton />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeRedirectPath(first(params.next));

  // 已是管理員就直接進後台
  const auth = await getAuthorization();
  if (auth.status === "admin") redirect(next);

  return (
    <div className="space-y-5">
      {first(params.signed_out) ? <StatusBanner tone="success" title="已登出" /> : null}
      {first(params.error) === "link_invalid" ? (
        <StatusBanner tone="error" title="連結無效或已過期">請重新申請驗證信或重設密碼信。</StatusBanner>
      ) : null}
      <LoginForm next={next} />
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="載入中">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full rounded-full" />
    </div>
  );
}
