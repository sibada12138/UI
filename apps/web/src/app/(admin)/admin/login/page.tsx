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
      setMessage(toErrorMessage(error, "登录失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--brand-green-dark)] px-6 py-14 text-white md:px-10">
      <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
        <div>
          <p className="text-sm text-white/70">XBK Design Console</p>
          <h1 className="h-display mt-3 text-5xl font-semibold leading-[1.1]">后台登录</h1>
          <p className="mt-4 max-w-xl text-sm text-white/75">
            登录后可访问主页、账户列表、待办中心、风控中心。所有管理功能均在登录后展示。
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="mx-auto mt-10 max-w-md rounded-[12px] border border-white/15 bg-white/8 p-8">
        <form className="grid gap-4" onSubmit={onSubmit}>
          <label className="text-sm text-white/80" htmlFor="username">
            用户名
          </label>
          <input
            id="username"
            className="field bg-white text-black"
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
            className="field bg-white text-black"
            placeholder="请输入密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="btn-primary mt-2 w-full" type="submit" disabled={loading}>
            {loading ? "登录中..." : "登录后台"}
          </button>
          <p className="text-xs text-white/70">
            默认账号密码来自 `ADMIN_INIT_USERNAME / ADMIN_INIT_PASSWORD`。
          </p>
          {message ? <p className="text-sm text-red-200">{message}</p> : null}
        </form>
      </div>
    </main>
  );
}
