"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getAdminToken } from "@/lib/admin-auth";

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
      setMessage(error instanceof Error ? error.message : "Load failed");
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
      setMessage(error instanceof Error ? error.message : "Create failed");
    }
  }

  return (
    <section className="grid gap-6">
      <header className="flex items-center justify-between">
        <h1 className="h-display text-4xl font-semibold">Admin Users</h1>
      </header>

      <form className="apple-panel grid gap-4 p-6 md:grid-cols-4" onSubmit={onCreate}>
        <input
          className="field"
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="field"
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          className="field"
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "operator_admin")}
        >
          <option value="operator_admin">operator_admin</option>
          <option value="admin">admin</option>
        </select>
        <button className="btn-primary" type="submit">
          Create
        </button>
      </form>

      <article className="apple-panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created At</th>
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



