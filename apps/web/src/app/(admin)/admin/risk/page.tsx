"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useMemo, useState } from "react";
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

type RecentIpItem = {
  ip: string;
  latestAt: string;
  count: number;
};

function formatScope(scope: "query" | "token_submit") {
  return scope === "query" ? "查询接口" : "登录提交";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function RiskPage() {
  const [ipBans, setIpBans] = useState<BanItem[]>([]);
  const [cdks, setCdks] = useState<CdkItem[]>([]);
  const [message, setMessage] = useState("");

  const [banScope, setBanScope] = useState<"query" | "token_submit">("token_submit");
  const [banIp, setBanIp] = useState("");
  const [banDurationMinutes, setBanDurationMinutes] = useState("60");
  const [banLoading, setBanLoading] = useState(false);

  const [recentModalOpen, setRecentModalOpen] = useState(false);
  const [recentIps, setRecentIps] = useState<RecentIpItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const blockedCdks = useMemo(() => cdks.filter((item) => item.status === "revoked"), [cdks]);

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

  async function loadRecentIps() {
    setRecentLoading(true);
    try {
      const data = await adminApiRequest<{ items: RecentIpItem[] }>(
        `/admin/security/recent-ips?scope=${banScope}&limit=80`,
      );
      setRecentIps(data.items);
    } catch (error) {
      const text = toErrorMessage(error, "最近 IP 加载失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setRecentLoading(false);
    }
  }

  async function banIpManual(event: FormEvent) {
    event.preventDefault();
    const ip = banIp.trim();
    if (!ip) {
      setMessage("请先输入 IP。");
      return;
    }

    setBanLoading(true);
    setMessage("");
    try {
      await adminApiRequest("/admin/security/bans/ban", {
        method: "POST",
        body: {
          scope: banScope,
          ip,
          durationMinutes: Number(banDurationMinutes || "60"),
        },
      });
      pushToast({ type: "success", message: "IP 已封禁。" });
      setBanIp("");
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "IP 封禁失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setBanLoading(false);
    }
  }

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
          支持封禁/解封 CDK 与 IP。系统会在连续失败 5 次后自动封禁 1 小时。
        </p>
      </article>

      <article className="apple-panel p-5">
        <h2 className="h-display text-2xl font-semibold">手动封禁 IP</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_140px_auto_auto]" onSubmit={banIpManual}>
          <select
            className="field"
            value={banScope}
            onChange={(e) => setBanScope(e.target.value as "query" | "token_submit")}
          >
            <option value="token_submit">登录提交</option>
            <option value="query">进度查询</option>
          </select>
          <input
            className="field"
            placeholder="输入要封禁的 IP"
            value={banIp}
            onChange={(e) => setBanIp(e.target.value)}
          />
          <input
            className="field"
            placeholder="封禁分钟"
            value={banDurationMinutes}
            onChange={(e) => setBanDurationMinutes(e.target.value)}
          />
          <button className="btn-pill" type="button" onClick={() => {
            setRecentModalOpen(true);
            void loadRecentIps();
          }}>
            从最近请求选择
          </button>
          <button className="btn-primary" type="submit" disabled={banLoading}>
            {banLoading ? "处理中..." : "封禁 IP"}
          </button>
        </form>
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
                  <td>{formatScope(item.scope)}</td>
                  <td className="font-mono">{item.ip}</td>
                  <td>{item.failedCount}</td>
                  <td>{Math.max(1, Math.ceil(item.remainingSec / 60))} 分钟</td>
                  <td>{formatDate(item.bannedUntil)}</td>
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
                  <td>{formatDate(item.expiresAt)}</td>
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
        <p className="mt-3 text-xs text-[var(--text-muted)]">当前封禁 CDK 数：{blockedCdks.length}</p>
      </article>

      {message ? <p className="text-sm text-[var(--danger)]">{message}</p> : null}

      {recentModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-[0_20px_55px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="h-display text-xl font-semibold">最近请求 IP</h3>
              <button className="btn-pill" onClick={() => setRecentModalOpen(false)} type="button">
                关闭
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              当前筛选类型：{formatScope(banScope)}
            </p>

            <div className="mt-4 table-shell">
              <table className="table-basic">
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>最近时间</th>
                    <th>次数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {recentIps.map((item) => (
                    <tr key={`${item.ip}-${item.latestAt}`}>
                      <td className="font-mono">{item.ip}</td>
                      <td>{formatDate(item.latestAt)}</td>
                      <td>{item.count}</td>
                      <td>
                        <button
                          className="btn-pill"
                          type="button"
                          onClick={() => {
                            setBanIp(item.ip);
                            setRecentModalOpen(false);
                          }}
                        >
                          选择
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!recentLoading && recentIps.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-[var(--text-muted)]">
                        暂无可选 IP。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
