import { FileQuestion } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <EmptyState
        icon={FileQuestion}
        title="找不到這個頁面"
        description="網址可能打錯了，或這篇筆記已被移除或尚未發布。"
        action={<ButtonLink href="/">回到首頁</ButtonLink>}
      />
    </div>
  );
}
