"use client";
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getAdminToken } from "@/lib/admin-auth";
import { toErrorMessage } from "@/lib/error-message";

type BanItem = {
  scope: "query" | "token_submit";
  ip: string;
  failedCount: number;
  bannedUntil: string;
  remainingSec: number;
};

export default function SecurityPage() {
  const [items, setItems] = useState<BanItem[]>([]);
  const [message, setMessage] = useState("");
  const token = getAdminToken();

  async function load() {
    try {
      const data = await apiRequest<{ items: BanItem[] }>("/admin/security/bans", {
        token,
      });
      setItems(data.items);
    } catch (error) {
      setMessage(toErrorMessage(error, "加载风控封禁列表失败"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function unban(item: BanItem) {
    setMessage("");
    try {
      await apiRequest("/admin/security/bans/unban", {
        method: "POST",
        token,
        body: { scope: item.scope, ip: item.ip },
      });
      await load();
    } catch (error) {
      setMessage(toErrorMessage(error, "解封失败"));
    }
  }

  return (
    <section className="grid gap-6">
      <header>
        <h1 className="h-display text-4xl font-semibold">风控解封</h1>
        <p className="mt-2 text-sm text-[var(--text-subtle)]">
          当查询或 token 提交连续失败超过 5 次后，IP 会被封禁 1 小时。可在此手动解封。
        </p>
      </header>

      <article className="apple-panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">失败次数</th>
              <th className="px-4 py-3">剩余封禁</th>
              <th className="px-4 py-3">到期时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.scope}-${item.ip}`} className="border-b border-black/5">
                <td className="px-4 py-3">
                  {item.scope === "query" ? "查询接口" : "Token 提交"}
                </td>
                <td className="px-4 py-3 font-mono">{item.ip}</td>
                <td className="px-4 py-3">{item.failedCount}</td>
                <td className="px-4 py-3">{Math.ceil(item.remainingSec / 60)} 分钟</td>
                <td className="px-4 py-3">{new Date(item.bannedUntil).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button className="btn-pill" type="button" onClick={() => void unban(item)}>
                    立即解封
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-[var(--text-subtle)]" colSpan={6}>
                  当前没有被封禁的 IP。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </section>
  );
}
