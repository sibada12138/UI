"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { saveAdminToken } from "@/lib/admin-auth";
import { toErrorMessage } from "@/lib/error-message";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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
      setMessage(toErrorMessage(error, "登录失败，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--hero-bg)] px-6 py-16 text-[var(--hero-text)] md:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <section className="max-w-xl">
          <p className="text-sm text-white/60">Recharge Card Platform</p>
          <h1 className="h-display mt-3 text-5xl font-semibold leading-[1.07] md:text-6xl">
            管理后台登录
          </h1>
          <p className="mt-4 text-base text-white/72">
            统一管理 token、用户提交记录、充值链接和风控解封。默认管理员账号来自后端环境变量。
          </p>
        </section>
        <div className="md:pt-2">
          <ThemeToggle />
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-md rounded-[12px] border border-white/10 bg-[var(--surface-soft-dark)] p-8">
        <form className="mt-8 grid gap-4" onSubmit={onSubmit}>
          <label className="text-sm text-white/80" htmlFor="username">
            用户名
          </label>
          <input
            id="username"
            className="field bg-white text-[var(--text-dark)]"
            placeholder="请输入管理员用户名"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label className="text-sm text-white/80" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            className="field bg-white text-[var(--text-dark)]"
            placeholder="请输入密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn-primary mt-3 w-full" type="submit" disabled={loading}>
            {loading ? "登录中..." : "登录后台"}
          </button>
          <p className="text-xs text-white/60">
            首次初始化使用 `ADMIN_INIT_USERNAME / ADMIN_INIT_PASSWORD`。
          </p>
          {message ? <p className="text-sm text-red-200">{message}</p> : null}
        </form>
      </div>
    </main>
  );
}
