"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminApiRequest } from "@/lib/admin-api";
import { fetchAdminAccounts, type AdminAccountItem } from "@/lib/admin-accounts";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

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

function taskStatusLabel(status: string) {
  if (status === "completed") return "已开";
  if (status === "pending") return "待处理";
  if (status === "link_generated") return "待充值";
  if (status === "processing") return "充值中";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  return status;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function tokenPreview(value: string) {
  const text = String(value || "");
  if (!text) return "-";
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}...${text.slice(-8)}`;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccountItem[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [focusAccountId, setFocusAccountId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operator_admin">("operator_admin");

  const allSelected = useMemo(
    () => accounts.length > 0 && accounts.every((item) => selectedIds.includes(item.id)),
    [accounts, selectedIds],
  );

  const filteredAccounts = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return accounts;
    }
    return accounts.filter((item) => {
      return (
        item.phoneMasked.toLowerCase().includes(keyword) ||
        item.phone.toLowerCase().includes(keyword) ||
        item.token.toLowerCase().includes(keyword)
      );
    });
  }, [accounts, searchKeyword]);

  async function load() {
    try {
      const [accountData, adminData] = await Promise.all([
        fetchAdminAccounts(),
        adminApiRequest<{ items: AdminUser[] }>("/admin/admin-users"),
      ]);
      setAccounts(accountData || []);
      setAdmins(adminData.items || []);
      setSelectedIds((prev) => prev.filter((id) => accountData.some((item) => item.id === id)));
    } catch (error) {
      const text = toErrorMessage(error, "加载账户数据失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const search = new URLSearchParams(window.location.search);
    const q = search.get("q") ?? "";
    const focus = search.get("focus") ?? "";
    if (q) {
      setSearchKeyword(q);
    }
    if (focus) {
      setFocusAccountId(focus);
      window.setTimeout(() => {
        const target = document.getElementById(`account-row-${focus}`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 260);
    }
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(accounts.map((item) => item.id));
  }

  function invertSelect() {
    setSelectedIds(accounts.filter((item) => !selectedIds.includes(item.id)).map((item) => item.id));
  }

  async function batchDeleteAccounts() {
    if (selectedIds.length === 0) {
      setMessage("请先选择至少一个账户。");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(`确认删除选中的 ${selectedIds.length} 个账户吗？`)) {
      return;
    }

    setDeleting(true);
    setMessage("");
    try {
      const data = await adminApiRequest<{ deletedCount: number }>("/admin/recharge/tasks/accounts/delete", {
        method: "POST",
        body: { submissionIds: selectedIds },
      });
      pushToast({ type: "success", message: `已删除 ${data.deletedCount} 个账户。` });
      setSelectedIds([]);
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "批量删除失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setDeleting(false);
    }
  }

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
          默认保存最近 24 小时登录记录，超时自动清理。支持多选、全选、反选和批量删除。
        </p>
      </article>

      <article className="apple-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="field h-10 w-[260px]"
              placeholder="搜索手机号或 CDK"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
            <button className="btn-pill" type="button" onClick={toggleSelectAll}>
              {allSelected ? "取消全选" : "全选"}
            </button>
            <button className="btn-pill" type="button" onClick={invertSelect}>
              反选
            </button>
            <button className="btn-pill" type="button" onClick={() => setSelectedIds([])}>
              清空选择
            </button>
            <button className="btn-primary" type="button" disabled={deleting} onClick={() => void batchDeleteAccounts()}>
              {deleting ? "删除中..." : "批量删除"}
            </button>
          </div>
          <span className="text-sm text-[var(--text-muted)]">已选 {selectedIds.length} 项</span>
        </div>

        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
                <th>手机号</th>
                <th>CDK</th>
                <th>登录方式</th>
                <th>AccessToken</th>
                <th>Cookie</th>
                <th>VIP</th>
                <th>状态</th>
                <th>提交时间</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((item) => (
                <tr
                  key={item.id}
                  id={`account-row-${item.id}`}
                  className={focusAccountId === item.id ? "bg-[color-mix(in_srgb,var(--gold)_10%,white)]" : ""}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </td>
                  <td>{item.phoneMasked || item.phone || "-"}</td>
                  <td className="font-mono">{item.token}</td>
                  <td>{item.smsCode.startsWith("QR:") ? "扫码登录" : "短信登录"}</td>
                  <td className="font-mono" title={item.accessToken || "-"}>
                    {tokenPreview(item.accessToken)}
                  </td>
                  <td className="font-mono" title={item.cookie || "-"}>
                    {tokenPreview(item.cookie)}
                  </td>
                  <td>
                    {item.hasUserVip || item.hasWinkVip
                      ? `User:${item.hasUserVip ? "Y" : "N"} Wink:${item.hasWinkVip ? "Y" : "N"}`
                      : "-"}
                  </td>
                  <td>
                    <span className="status-pill">{taskStatusLabel(item.status)}</span>
                  </td>
                  <td>{formatDate(item.submittedAt)}</td>
                  <td>{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-[var(--text-muted)]">
                    暂无匹配记录。
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
