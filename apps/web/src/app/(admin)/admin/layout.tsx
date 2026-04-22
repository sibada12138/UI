"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearAdminToken, getAdminToken } from "@/lib/admin-auth";

const navItems = [
  { href: "/admin/dashboard", label: "主页" },
  { href: "/admin/accounts", label: "账户列表" },
  { href: "/admin/todo", label: "待办中心" },
  { href: "/admin/risk", label: "风控中心" },
  { href: "/admin/api-center", label: "API 中心" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const hasToken = typeof window !== "undefined" && getAdminToken().trim().length > 0;

  useEffect(() => {
    if (!isLoginPage && !hasToken) {
      clearAdminToken();
      router.replace("/admin/login");
    }
  }, [hasToken, isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!hasToken) {
    return <main className="min-h-screen bg-[var(--page-bg)]" />;
  }

  return (
    <div className={`admin-shell ${sidebarExpanded ? "sidebar-open" : "sidebar-closed"}`}>
      <aside
        className="admin-sidebar"
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div>
          <p className="sidebar-label text-xs uppercase tracking-[0.2em] text-[var(--text-subtle)]">管理控制台</p>
          <h1 className="h-display sidebar-label mt-2 text-2xl font-semibold text-[var(--page-text)]">CDK 发卡后台</h1>
          <p className="sidebar-label mt-2 text-xs text-[var(--text-muted)]">统一处理账户、CDK、待办与风控。</p>
        </div>

        <nav className="mt-8 grid gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`admin-nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
            >
              <span className="sidebar-label">{item.label}</span>
              <span className="sidebar-compact-label">{item.label.slice(0, 1)}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-label mt-auto rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-4 text-xs text-[var(--text-muted)]">
          <p>CDK 默认有效期 1 小时。</p>
          <p className="mt-1">过期记录保留 24 小时后自动清理。</p>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-subtle)]">后台管理</p>
            <span className="h-display text-xl font-semibold text-[var(--page-text)]">运营管理台</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="btn-pill"
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
