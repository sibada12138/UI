"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { saveAdminToken } from "@/lib/admin-auth";
import { toErrorMessage } from "@/lib/error-message";

function AdminLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const reason = searchParams.get("reason");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await apiRequest<{ accessToken: string }>("/admin/auth/login", {
        method: "POST",
        body: { username, password },
      });
      saveAdminToken(data.accessToken);
      router.push("/admin/dashboard");
    } catch (error) {
      setMessage(toErrorMessage(error, "登录失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-accent)] px-4 py-10 text-[var(--page-text)] md:px-10 md:py-14">
      <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--text-muted)]">XBK Design Console</p>
          <h1 className="h-display mt-3 text-4xl font-semibold leading-[1.1] md:text-5xl">后台登录</h1>
          <p className="mt-4 max-w-xl text-sm text-[var(--text-muted)]">
            登录后可访问主页、账户列表、待办中心、风控中心。所有管理功能均在登录后展示。
          </p>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-md rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg)] p-8">
        {reason === "session" ? (
          <p className="mb-4 rounded-[10px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] px-3 py-2 text-sm text-[var(--text-muted)]">
            登录会话已失效，请重新登录。
          </p>
        ) : null}
        <form className="grid gap-4" onSubmit={onSubmit}>
          <label className="text-sm text-[var(--text-muted)]" htmlFor="username">
            用户名
          </label>
          <input
            id="username"
            className="field"
            placeholder="请输入管理员用户名"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label className="text-sm text-[var(--text-muted)]" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            className="field"
            placeholder="请输入密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="btn-primary mt-2 w-full" type="submit" disabled={loading}>
            {loading ? "登录中..." : "登录后台"}
          </button>
          <p className="text-xs text-[var(--text-subtle)]">
            默认账号密码来自 `ADMIN_INIT_USERNAME / ADMIN_INIT_PASSWORD`。
          </p>
          {message ? <p className="text-sm text-[var(--danger)]">{message}</p> : null}
        </form>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginPageContent />
    </Suspense>
  );
}
