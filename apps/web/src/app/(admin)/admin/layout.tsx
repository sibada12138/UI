"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/admin-auth";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/admin/dashboard", label: "总览" },
  { href: "/admin/tokens", label: "Token 管理" },
  { href: "/admin/recharge", label: "充值工单" },
  { href: "/admin/security", label: "风控解封" },
  { href: "/admin/admin-users", label: "管理员" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 px-6 py-4 text-white backdrop-blur-[20px] md:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/55">Recharge System</p>
            <span className="h-display text-xl font-semibold">充值发卡后台</span>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[980px] border border-white/20 px-3 py-1.5 hover:border-[var(--link-on-dark)] hover:text-[var(--link-on-dark)]"
              >
                {item.label}
              </Link>
            ))}
            <ThemeToggle />
            <button
              className="rounded-[980px] border border-white/20 px-3 py-1.5 hover:border-[var(--link-on-dark)] hover:text-[var(--link-on-dark)]"
              onClick={() => {
                clearAdminToken();
                router.push("/admin/login");
              }}
              type="button"
            >
              退出登录
            </button>
          </nav>
        </div>
      </header>
      <main className="px-6 py-10 md:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
