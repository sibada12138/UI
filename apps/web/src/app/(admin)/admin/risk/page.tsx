"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { adminApiRequest } from "@/lib/admin-api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type BanItem = {
  scope: "query" | "token_submit";
  ip: string;
  failedCount: number;
  bannedUntil: string;
  remainingSec: number;
};

type CdkItem = {
  id: string;
  token: string;
  status: string;
  expiresAt: string;
};

export default function RiskPage() {
  const [ipBans, setIpBans] = useState<BanItem[]>([]);
  const [cdks, setCdks] = useState<CdkItem[]>([]);
  const [message, setMessage] = useState("");

  const blockedCdks = useMemo(
    () => cdks.filter((item) => item.status === "revoked"),
    [cdks],
  );

  async function load() {
    try {
      const [ipData, cdkData] = await Promise.all([
        adminApiRequest<{ items: BanItem[] }>("/admin/security/bans"),
        adminApiRequest<{ items: CdkItem[] }>("/admin/tokens"),
      ]);
      setIpBans(ipData.items);
      setCdks(cdkData.items);
    } catch (error) {
      const text = toErrorMessage(error, "加载风控数据失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function unbanIp(item: BanItem) {
    setMessage("");
    try {
      await adminApiRequest("/admin/security/bans/unban", {
        method: "POST",
        body: { scope: item.scope, ip: item.ip },
      });
      pushToast({ type: "success", message: "IP 已解封。" });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "IP 解封失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  async function banCdk(id: string) {
    setMessage("");
    try {
      await adminApiRequest(`/admin/tokens/${id}/revoke`, {
        method: "POST",
      });
      pushToast({ type: "success", message: "CDK 已封禁。" });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "CDK 封禁失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  async function unbanCdk(id: string) {
    setMessage("");
    try {
      await adminApiRequest(`/admin/tokens/${id}/unban`, {
        method: "POST",
      });
      pushToast({ type: "success", message: "CDK 已解封。" });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "CDK 解封失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-6">
        <h1 className="h-display section-title">风控中心</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          支持封禁/解封 CDK 与封禁 IP 处理。IP 连续失败 5 次会自动封禁 1 小时。
        </p>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">封禁 IP / 解封 IP</h2>
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>类型</th>
                <th>IP</th>
                <th>失败次数</th>
                <th>剩余封禁</th>
                <th>到期时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {ipBans.map((item) => (
                <tr key={`${item.scope}-${item.ip}`}>
                  <td>{item.scope === "query" ? "查询接口" : "CDK 提交"}</td>
                  <td className="font-mono">{item.ip}</td>
                  <td>{item.failedCount}</td>
                  <td>{Math.max(1, Math.ceil(item.remainingSec / 60))} 分钟</td>
                  <td>{new Date(item.bannedUntil).toLocaleString()}</td>
                  <td>
                    <button className="btn-pill" onClick={() => void unbanIp(item)} type="button">
                      解封 IP
                    </button>
                  </td>
                </tr>
              ))}
              {ipBans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-[var(--text-muted)]">
                    当前没有封禁 IP。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">封禁 CDK / 解封 CDK</h2>
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>CDK</th>
                <th>状态</th>
                <th>过期时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {cdks.map((item) => (
                <tr key={item.id}>
                  <td className="font-mono">{item.token}</td>
                  <td>{item.status}</td>
                  <td>{new Date(item.expiresAt).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      {item.status !== "revoked" ? (
                        <button className="btn-pill" onClick={() => void banCdk(item.id)} type="button">
                          封禁 CDK
                        </button>
                      ) : (
                        <button className="btn-primary" onClick={() => void unbanCdk(item.id)} type="button">
                          解封 CDK
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          当前封禁 CDK 数：{blockedCdks.length}
        </p>
      </article>

      {message ? <p className="text-sm text-[var(--danger)]">{message}</p> : null}
    </section>
  );
}
