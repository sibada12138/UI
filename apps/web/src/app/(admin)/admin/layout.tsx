"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearAdminToken,
  getAdminProfile,
  getAdminToken,
  type AdminProfile,
} from "@/lib/admin-auth";
import { apiRequest } from "@/lib/api";

type NavIconKey = "dashboard" | "accounts" | "todo" | "risk" | "api";

type NavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
};

const navItems: NavItem[] = [
  { href: "/admin/dashboard", label: "主页", icon: "dashboard" },
  { href: "/admin/accounts", label: "账户列表", icon: "accounts" },
  { href: "/admin/todo", label: "待办中心", icon: "todo" },
  { href: "/admin/risk", label: "风控中心", icon: "risk" },
  { href: "/admin/api-center", label: "API 中心", icon: "api" },
];

function NavIcon({ icon }: { icon: NavIconKey }) {
  if (icon === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" className="admin-nav-icon" aria-hidden>
        <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" fill="currentColor" />
      </svg>
    );
  }
  if (icon === "accounts") {
    return (
      <svg viewBox="0 0 24 24" className="admin-nav-icon" aria-hidden>
        <path
          d="M16 13c2.8 0 5 2.2 5 5v2h-2v-2c0-1.7-1.3-3-3-3h-3v-2h3zm-8 0c2.8 0 5 2.2 5 5v2H3v-2c0-2.8 2.2-5 5-5zm0-9a4 4 0 110 8 4 4 0 010-8zm8 1a3 3 0 110 6 3 3 0 010-6z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (icon === "todo") {
    return (
      <svg viewBox="0 0 24 24" className="admin-nav-icon" aria-hidden>
        <path
          d="M9 4h6v2h4v14H5V6h4V4zm8 4H7v10h10V8zM10 3h4v2h-4V3zm.7 8.3l1.5 1.5 3.1-3.1 1.4 1.4-4.5 4.5-2.9-2.9 1.4-1.4z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (icon === "risk") {
    return (
      <svg viewBox="0 0 24 24" className="admin-nav-icon" aria-hidden>
        <path
          d="M12 2l9 4v6c0 5.5-3.8 9.8-9 10-5.2-.2-9-4.5-9-10V6l9-4zm0 5a3 3 0 00-3 3v1H8v2h8v-2h-1v-1a3 3 0 00-3-3zm0 8a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="admin-nav-icon" aria-hidden>
      <path
        d="M4 5h16v3H4V5zm0 5h10v3H4v-3zm0 5h16v3H4v-3zm13-5l3 3-3 3v-2h-3v-2h3v-2z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  const [mounted, setMounted] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [sidebarHovering, setSidebarHovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const expanded = !collapsed || sidebarHovering;

  const username = useMemo(() => {
    const current = profile?.username?.trim();
    if (current) {
      return current;
    }
    return "管理员";
  }, [profile]);

  useEffect(() => {
    setMounted(true);
    const token = getAdminToken().trim();
    setHasToken(Boolean(token));
    setProfile(getAdminProfile());
  }, [pathname]);

  useEffect(() => {
    if (!mounted || isLoginPage) {
      return;
    }
    if (!hasToken) {
      clearAdminToken();
      router.replace("/admin/login?reason=session");
    }
  }, [mounted, hasToken, isLoginPage, router]);

  async function onLogout() {
    const token = getAdminToken().trim();
    try {
      if (token) {
        await apiRequest("/admin/auth/logout", { method: "POST", token });
      }
    } catch {
      // ignore logout API errors, local clear is enough
    } finally {
      clearAdminToken();
      router.replace("/admin/login");
    }
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!mounted || !hasToken) {
    return <main className="min-h-screen bg-[var(--page-bg)]" />;
  }

  return (
    <div className={`admin-shell ${expanded ? "sidebar-open" : "sidebar-closed"}`}>
      <aside
        className="admin-sidebar"
        onMouseEnter={() => setSidebarHovering(true)}
        onMouseLeave={() => setSidebarHovering(false)}
      >
        <div className="sidebar-head">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={collapsed ? "展开导航栏" : "收起导航栏"}
            onClick={() => {
              setCollapsed((prev) => !prev);
              setSidebarHovering(false);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 7h16v2H4zm0 8h16v2H4zm0-4h10v2H4z" fill="currentColor" />
            </svg>
          </button>
          <div className="sidebar-label">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-subtle)]">管理控制台</p>
            <h1 className="h-display mt-1 text-xl font-semibold text-[var(--page-text)]">CDK 开通后台</h1>
          </div>
        </div>

        <nav className="mt-6 grid gap-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`admin-nav-item ${active ? "active" : ""}`} title={item.label}>
                <NavIcon icon={item.icon} />
                <span className="sidebar-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-subtle)]">后台管理</p>
            <span className="h-display text-xl font-semibold text-[var(--page-text)]">运营管理台</span>
          </div>

          <div
            className="admin-profile-wrap"
            onMouseEnter={() => setMenuOpen(true)}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              type="button"
              className="admin-profile-chip"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="管理员菜单"
            >
              <span className="admin-avatar">{username.slice(0, 1).toUpperCase()}</span>
              <span className="admin-profile-name">{username}</span>
              <svg viewBox="0 0 24 24" aria-hidden className={`admin-profile-arrow ${menuOpen ? "open" : ""}`}>
                <path d="M7 10l5 5 5-5z" fill="currentColor" />
              </svg>
            </button>
            {menuOpen ? (
              <div className="admin-profile-menu">
                <button type="button" className="admin-profile-menu-item" onClick={() => void onLogout()}>
                  退出登录
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="px-5 py-6 md:px-8">{children}</main>
      </section>
    </div>
  );
}
