"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getAdminToken } from "@/lib/admin-auth";
import { toErrorMessage } from "@/lib/error-message";

type AdminUser = {
  id: string;
  username: string;
  role: "admin" | "operator_admin";
  status: string;
  createdAt: string;
};

export default function AdminUsersPage() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operator_admin">("operator_admin");
  const token = getAdminToken();

  async function load() {
    try {
      const data = await apiRequest<{ items: AdminUser[] }>("/admin/admin-users", { token });
      setItems(data.items);
    } catch (error) {
      setMessage(toErrorMessage(error, "加载管理员列表失败"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await apiRequest("/admin/admin-users", {
        method: "POST",
        token,
        body: { username, password, role },
      });
      setUsername("");
      setPassword("");
      setRole("operator_admin");
      await load();
    } catch (error) {
      setMessage(toErrorMessage(error, "创建管理员失败"));
    }
  }

  return (
    <section className="grid gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="h-display text-4xl font-semibold">管理员账户</h1>
          <p className="mt-2 text-sm text-[var(--text-subtle)]">
            仅 `admin` 角色可新增管理员；`operator_admin` 没有继续创建管理员权限。
          </p>
        </div>
      </header>

      <form className="apple-panel grid gap-4 p-6 md:grid-cols-4" onSubmit={onCreate}>
        <input
          className="field"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="field"
          placeholder="密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          className="field"
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "operator_admin")}
        >
          <option value="operator_admin">operator_admin（普通管理员）</option>
          <option value="admin">admin（超级管理员）</option>
        </select>
        <button className="btn-primary" type="submit">
          创建账号
        </button>
      </form>

      <article className="apple-panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-4 py-3">用户名</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-black/5">
                <td className="px-4 py-3">{item.username}</td>
                <td className="px-4 py-3">{item.role}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3">{new Date(item.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </section>
  );
}



