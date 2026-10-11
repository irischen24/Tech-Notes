import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-outline-variant/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 type-body-sm text-on-surface-variant sm:px-6">
        <span>Iris Notes：個人技術筆記與知識庫</span>
        <Link href="/login" className="rounded-full px-2 py-1 hover:text-primary">
          管理員登入
        </Link>
      </div>
    </footer>
  );
}
