import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthorization } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: { default: "管理後台", template: "%s｜Iris Notes 管理後台" },
  robots: { index: false, follow: false },
};

/**
 * 後台外框。這裡的檢查是第二道防線（第一道是 proxy、最後一道是 RLS）；
 * 每個頁面、Server Action、Route Handler 仍會獨立呼叫 DAL 驗證。
 * Phase 4 會在此加入 Sidebar 與 Breadcrumb。
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: ReactNode }) {
  const auth = await getAuthorization();

  if (auth.status === "unauthenticated") {
    redirect("/login?next=%2Fadmin");
  }

  if (auth.status === "forbidden") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <EmptyState
          icon={ShieldAlert}
          title="此帳號沒有管理權限"
          description="管理後台只開放給管理員。如需權限，請由專案擁有者在資料庫設定角色。"
          action={<LogoutButton variant="tonal" />}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-full bg-surface-container px-5 py-2">
        <p className="type-label text-on-surface-variant">
          管理員：<span className="text-on-surface">{auth.profile.username}</span>
        </p>
        <LogoutButton />
      </div>
      {children}
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6" aria-busy="true" aria-label="載入中">
      <Skeleton className="h-12 w-full rounded-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
