"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/admin-auth";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/admin/dashboard", label: "主页" },
  { href: "/admin/accounts", label: "账户列表" },
  { href: "/admin/todo", label: "待办中心" },
  { href: "/admin/risk", label: "风控中心" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/55">XBK Console</p>
          <h1 className="h-display mt-2 text-2xl font-semibold text-white">CDK 发卡后台</h1>
          <p className="mt-2 text-xs text-white/70">登录后统一处理账户、CDK、待办与风控。</p>
        </div>

        <nav className="mt-8 grid gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-[12px] border border-white/15 bg-white/6 p-4 text-xs text-white/72">
          <p>CDK 默认有效期 30 分钟。</p>
          <p className="mt-1">用户提交成功后 CDK 立即失效，后台保留可追溯记录。</p>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/55">Management</p>
            <span className="h-display text-xl font-semibold text-white">运营管理台</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            <button
              className="btn-pill border-white/30 text-white hover:bg-white/10"
              onClick={() => {
                clearAdminToken();
                router.push("/admin/login");
              }}
              type="button"
            >
              退出登录
            </button>
          </div>
        </header>
        <main className="px-5 py-6 md:px-8">{children}</main>
      </section>
    </div>
  );
}
