"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";
import { adminApiRequest } from "@/lib/admin-api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type AccountItem = {
  id: string;
  phone: string;
  phoneMasked: string;
  smsCode: string;
  token: string;
  status: string;
  submittedAt: string;
  updatedAt: string;
};

type AdminUser = {
  id: string;
  username: string;
  role: "admin" | "operator_admin";
  status: string;
  createdAt: string;
};

function roleLabel(role: "admin" | "operator_admin") {
  if (role === "admin") return "超级管理员";
  return "运营管理员";
}

function adminStatusLabel(status: string) {
  if (status === "active") return "启用";
  if (status === "disabled") return "禁用";
  return status;
}

function statusLabel(status: string) {
  if (status === "completed") return "已开";
  if (status === "pending") return "待处理";
  if (status === "link_generated") return "待充值";
  if (status === "processing") return "充值中";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  return status;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operator_admin">("operator_admin");

  async function load() {
    try {
      const [taskData, adminData] = await Promise.all([
        adminApiRequest<{ items: AccountItem[] }>("/admin/recharge/tasks"),
        adminApiRequest<{ items: AdminUser[] }>("/admin/admin-users"),
      ]);
      setAccounts(taskData.items);
      setAdmins(adminData.items);
    } catch (error) {
      const text = toErrorMessage(error, "加载账户数据失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreateAdmin(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await adminApiRequest("/admin/admin-users", {
        method: "POST",
        body: { username, password, role },
      });
      setUsername("");
      setPassword("");
      setRole("operator_admin");
      pushToast({ type: "success", message: "管理员创建成功。" });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "创建管理员失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-6">
        <h1 className="h-display section-title">账户列表</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          这里汇总用户提交的手机号、验证码与对应 CDK，用于客服人工开号处理。
        </p>
      </article>

      <article className="apple-panel p-4">
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>手机号</th>
                <th>短信验证码</th>
                <th>CDK</th>
                <th>状态</th>
                <th>提交时间</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((item) => (
                <tr key={item.id}>
                  <td>{item.phone}</td>
                  <td className="font-mono">{item.smsCode}</td>
                  <td className="font-mono">{item.token}</td>
                  <td>
                    <span className="status-pill">{statusLabel(item.status)}</span>
                  </td>
                  <td>{new Date(item.submittedAt).toLocaleString()}</td>
                  <td>{new Date(item.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-[var(--text-muted)]">
                    暂无账户提交记录。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="apple-panel p-6">
        <h2 className="h-display text-2xl font-semibold">管理员账户</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          只有超级管理员可创建管理员；运营管理员无创建权限。
        </p>

        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onCreateAdmin}>
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
            <option value="operator_admin">运营管理员</option>
            <option value="admin">超级管理员</option>
          </select>
          <button className="btn-primary" type="submit">
            新增管理员
          </button>
        </form>

        <div className="mt-4 table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>用户名</th>
                <th>角色</th>
                <th>状态</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((item) => (
                <tr key={item.id}>
                  <td>{item.username}</td>
                  <td>{roleLabel(item.role)}</td>
                  <td>{adminStatusLabel(item.status)}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {message ? <p className="text-sm text-[var(--danger)]">{message}</p> : null}
    </section>
  );
}
