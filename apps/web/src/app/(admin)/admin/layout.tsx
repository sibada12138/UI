"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearAdminToken,
  getAdminProfile,
  getAdminToken,
  hasAdminSessionCookie,
  type AdminProfile,
} from "@/lib/admin-auth";
import { apiRequest } from "@/lib/api";
import { adminApiRequest } from "@/lib/admin-api";
import { pushToast } from "@/lib/toast";

type NavIconKey = "dashboard" | "accounts" | "todo" | "risk" | "api";

type NavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
};

type TaskNotificationItem = {
  taskId: string;
  token: string;
  phoneMasked: string;
  status: string;
  eventType: "new_submission" | "task_update";
  updatedAt: string;
  remark: string | null;
};

type NotificationResponse = {
  since: string | null;
  latestUpdatedAt: string;
  serverTime: string;
  items: TaskNotificationItem[];
};

const navItems: NavItem[] = [
  { href: "/admin/dashboard", label: "主页", icon: "dashboard" },
  { href: "/admin/accounts", label: "账户列表", icon: "accounts" },
  { href: "/admin/todo", label: "待办中心", icon: "todo" },
  { href: "/admin/risk", label: "风控中心", icon: "risk" },
  { href: "/admin/api-center", label: "API 中心", icon: "api" },
];

const SOUND_PREF_KEY = "admin_notify_sound_enabled";
const NOTIFY_POLL_MS = 8000;

function maskToken(token: string) {
  const value = String(token ?? "").trim();
  if (!value) {
    return "(empty)";
  }
  if (value.length <= 12) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function logLayoutDebug(message: string, payload?: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }
  if (payload) {
    console.info("[AUTH_DEBUG][layout]", message, payload);
    return;
  }
  console.info("[AUTH_DEBUG][layout]", message);
}

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

function roleLabel(role?: string) {
  if (role === "admin") return "超级管理员";
  if (role === "operator_admin") return "运营管理员";
  return "管理员";
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  const [mounted, setMounted] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [sidebarHovering, setSidebarHovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const soundEnabledRef = useRef(true);

  const expanded = !collapsed || sidebarHovering;

  const username = useMemo(() => {
    const current = profile?.username?.trim();
    if (current) {
      return current;
    }
    return "管理员";
  }, [profile]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    setMounted(true);
    setAuthReady(false);
    const token = getAdminToken().trim();
    const hasSession = Boolean(token) || hasAdminSessionCookie();
    setHasToken(hasSession);
    const nextProfile = getAdminProfile();
    setProfile(nextProfile);
    setAuthReady(true);
    logLayoutDebug("init auth snapshot", {
      pathname,
      isLoginPage,
      hasToken: hasSession,
      hasSessionCookie: hasAdminSessionCookie(),
      token: maskToken(token),
      profileUser: nextProfile?.username ?? "",
      profileRole: nextProfile?.role ?? "",
    });

    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(SOUND_PREF_KEY);
      if (stored === "0") {
        setSoundEnabled(false);
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (!mounted || !authReady || isLoginPage) {
      return;
    }
    const latestToken = getAdminToken().trim();
    const hasSession = Boolean(latestToken) || hasAdminSessionCookie();
    logLayoutDebug("session check", {
      pathname,
      hasTokenState: hasToken,
      hasSessionCookie: hasAdminSessionCookie(),
      latestToken: maskToken(latestToken),
    });
    if (!hasSession) {
      logLayoutDebug("session check failed -> redirect login", { reason: "no_token_and_no_cookie" });
      clearAdminToken();
      router.replace("/admin/login?reason=session");
      return;
    }
    if (!hasToken) {
      setHasToken(true);
    }
  }, [mounted, authReady, hasToken, isLoginPage, router]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (menuWrapRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!mounted || isLoginPage || !hasToken) {
      return;
    }

    let stopped = false;
    let since = new Date().toISOString();
    const audio = typeof Audio !== "undefined" ? new Audio("/tips.mp3") : null;
    if (audio) {
      audio.preload = "auto";
    }

    async function poll(withToast: boolean) {
      if (stopped) {
        return;
      }
      try {
        const data = await adminApiRequest<NotificationResponse>(
          `/admin/recharge/tasks/notifications?since=${encodeURIComponent(since)}&limit=40`,
        );

        if (data.latestUpdatedAt) {
          since = data.latestUpdatedAt;
        }

        if (!withToast || !Array.isArray(data.items) || data.items.length === 0) {
          return;
        }

        const newSubmissions = data.items.filter((item) => item.eventType === "new_submission");
        if (newSubmissions.length > 0) {
          const first = newSubmissions[0];
          if (newSubmissions.length === 1) {
            pushToast({
              type: "info",
              title: "新登录提交",
              message: `${first.phoneMasked} (${first.token}) 已提交，待处理。`,
            });
          } else {
            pushToast({
              type: "info",
              title: "新登录提交",
              message: `新增 ${newSubmissions.length} 条登录提交，请到待办中心处理。`,
            });
          }

          if (soundEnabledRef.current && audio) {
            try {
              audio.currentTime = 0;
              await audio.play();
            } catch {
              // tips.mp3 may not exist yet; ignore playback errors
            }
          }
          window.dispatchEvent(new CustomEvent("admin:data-updated"));
        }

        const taskUpdates = data.items.filter((item) => item.eventType === "task_update");
        if (taskUpdates.length > 0) {
          const completedCount = taskUpdates.filter((item) => item.status === "completed").length;
          const failedCount = taskUpdates.filter((item) => item.status === "failed").length;
          if (completedCount > 0) {
            pushToast({
              type: "success",
              title: "开通反馈",
              message: completedCount === 1 ? "有 1 条任务标记为开通成功。" : `有 ${completedCount} 条任务标记为开通成功。`,
            });
          }
          if (failedCount > 0) {
            pushToast({
              type: "warning",
              title: "开通反馈",
              message: failedCount === 1 ? "有 1 条任务标记为开通失败。" : `有 ${failedCount} 条任务标记为开通失败。`,
            });
          }
          window.dispatchEvent(new CustomEvent("admin:data-updated"));
        }
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        if (
          raw.includes('/api/admin/recharge/tasks/notifications') &&
          raw.toLowerCase().includes('cannot get')
        ) {
          stopped = true;
          logLayoutDebug("notification poll stopped", {
            error: raw,
          });
          return;
        }
        logLayoutDebug("notification poll failed", {
          error: raw || "request_failed",
        });
      }
    }

    void poll(false);
    const timer = window.setInterval(() => {
      void poll(true);
    }, NOTIFY_POLL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [mounted, hasToken, isLoginPage]);

  async function onLogout() {
    const token = getAdminToken().trim();
    logLayoutDebug("logout start", { hasToken: Boolean(token), token: maskToken(token) });
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

  function toggleSoundEnabled() {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0");
      }
      pushToast({
        type: "info",
        title: "提示音设置",
        message: next ? "已开启提示音" : "已关闭提示音",
        durationMs: 1800,
      });
      return next;
    });
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!mounted || !hasToken) {
    return (
      <main className="min-h-screen bg-[var(--page-bg)] p-6">
        <section className="mx-auto max-w-3xl">
          <article className="apple-panel p-6">
            <div className="grid gap-3">
              <div className="loading-skeleton loading-skeleton-line h-7 w-48" />
              <div className="loading-skeleton loading-skeleton-line w-full" />
              <div className="loading-skeleton loading-skeleton-line w-4/5" />
            </div>
          </article>
        </section>
      </main>
    );
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

          <div className="admin-profile-wrap" ref={menuWrapRef}>
            <button
              type="button"
              className="admin-profile-chip"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              aria-label="管理员菜单"
              aria-expanded={menuOpen}
            >
              <span className="admin-avatar">{username.slice(0, 1).toUpperCase()}</span>
              <span className="admin-profile-name">{username}</span>
              <span className="admin-profile-role">{roleLabel(profile?.role)}</span>
              <svg viewBox="0 0 24 24" aria-hidden className={`admin-profile-arrow ${menuOpen ? "open" : ""}`}>
                <path d="M7 10l5 5 5-5z" fill="currentColor" />
              </svg>
            </button>
            {menuOpen ? (
              <div
                className="admin-profile-menu"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="admin-profile-menu-item"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    toggleSoundEnabled();
                    setMenuOpen(false);
                  }}
                >
                  {soundEnabled ? "关闭提示音" : "开启提示音"}
                </button>
                <button
                  type="button"
                  className="admin-profile-menu-item"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setMenuOpen(false);
                    void onLogout();
                  }}
                >
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
