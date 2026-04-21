"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { saveAdminToken } from "@/lib/admin-auth";

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
      setMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-dark)] px-6 py-16 text-white md:px-10">
      <div className="mx-auto max-w-md rounded-[12px] bg-[var(--surface-soft-dark)] p-8">
        <h1 className="h-display text-4xl font-semibold leading-tight">Admin Login</h1>
        <form className="mt-8 grid gap-4" onSubmit={onSubmit}>
          <label className="text-sm text-white/80" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="field bg-white text-[var(--text-dark)]"
            placeholder="Enter username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label className="text-sm text-white/80" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="field bg-white text-[var(--text-dark)]"
            placeholder="Enter password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn-primary mt-3 w-full" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <p className="text-xs text-white/60">
            First run uses ADMIN_INIT_USERNAME / ADMIN_INIT_PASSWORD from api .env.
          </p>
          {message ? <p className="text-sm text-red-200">{message}</p> : null}
        </form>
      </div>
    </main>
  );
}

