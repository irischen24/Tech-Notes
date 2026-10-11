import { AdminPageHeader } from "@/components/admin/page-header";
import { PasswordForm, UsernameForm } from "@/components/admin/settings-forms";
import { Card } from "@/components/ui/card";
import { StatusBanner } from "@/components/ui/status-banner";
import { requireAdmin } from "@/lib/auth/dal";
import { isHackmdConfigured } from "@/lib/env.server";

export const metadata = { title: "個人設定" };

export default async function AdminSettingsPage() {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;
  const hackmd = isHackmdConfigured();

  return (
    <>
      <AdminPageHeader title="個人設定" crumbs={[{ label: "設定" }]} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="type-title mb-1">顯示名稱</h2>
          <p className="type-body-sm mb-4 text-on-surface-variant">登入帳號：{guard.user.email ?? "（未提供）"}</p>
          <UsernameForm username={guard.profile.username} />
        </Card>
        <Card>
          <h2 className="type-title mb-4">變更密碼</h2>
          <PasswordForm />
        </Card>
        <Card className="xl:col-span-2">
          <h2 className="type-title mb-2">HackMD 連線設定</h2>
          {hackmd ? (
            <StatusBanner tone="success" title="已設定 HACKMD_API_TOKEN">Token 只存在伺服器環境變數，這裡不會顯示內容。</StatusBanner>
          ) : (
            <StatusBanner tone="info" title="尚未設定 HACKMD_API_TOKEN">
              HackMD 匯入在下一階段開放。屆時請在 Vercel → Settings → Environment Variables 新增 HACKMD_API_TOKEN（不要加 NEXT_PUBLIC_ 前綴），然後重新部署。
            </StatusBanner>
          )}
        </Card>
      </div>
    </>
  );
}
