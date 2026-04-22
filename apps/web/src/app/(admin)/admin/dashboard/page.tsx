"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApiRequest } from "@/lib/admin-api";
import { fetchAdminAccounts, type AdminAccountItem } from "@/lib/admin-accounts";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type DailySnapshot = {
  date: string;
  tokenCreated: number;
  submissionCount: number;
  completedCount: number;
  failedCount: number;
};

type MetricsResponse = {
  activeTokens: number;
  consumedToday: number;
  queryFailRate: number;
  bannedIpCount: number;
  pendingRechargeTasks: number;
  dailySnapshots: DailySnapshot[];
};

type CdkItem = {
  id: string;
  token: string;
  status: string;
  expiresAt: string;
};

type SearchCandidate = {
  id: string;
  taskId: string | null;
  phoneLabel: string;
  token: string;
  status: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function cdkStatusLabel(status: string) {
  if (status === "active") return "可使用";
  if (status === "consumed") return "已提交";
  if (status === "expired") return "已过期";
  if (status === "revoked") return "已封禁";
  return status;
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

async function copyToClipboard(value: string) {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(input);
  return copied;
}

export default function DashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [cdks, setCdks] = useState<CdkItem[]>([]);
  const [accounts, setAccounts] = useState<SearchCandidate[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quickCreating, setQuickCreating] = useState(false);
  const [message, setMessage] = useState("");

  const summaryCards = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return [
      {
        label: "可用 CDK",
        value: metrics.activeTokens,
        line: "#00754a",
      },
      {
        label: "今日提交",
        value: metrics.consumedToday,
        line: "#2b6cb0",
      },
      {
        label: "待办任务",
        value: metrics.pendingRechargeTasks,
        line: "#cba258",
      },
      {
        label: "封禁 IP",
        value: metrics.bannedIpCount,
        line: "#b5474f",
      },
    ];
  }, [metrics]);

  const filteredCandidates = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return accounts.slice(0, 8);
    }
    return accounts
      .filter((item) => {
        return (
          item.phoneLabel.toLowerCase().includes(keyword) ||
          item.token.toLowerCase().includes(keyword)
        );
      })
      .slice(0, 10);
  }, [accounts, searchKeyword]);

  const snapshotRows = metrics?.dailySnapshots ?? [];
  const chartMax = useMemo(() => {
    const maxValue = snapshotRows.reduce((currentMax, row) => {
      const rowMax = Math.max(row.tokenCreated, row.submissionCount, row.completedCount, row.failedCount);
      return Math.max(currentMax, rowMax);
    }, 0);
    return maxValue > 0 ? maxValue : 1;
  }, [snapshotRows]);

  async function loadData() {
    setLoading(true);
    setMessage("");
    try {
      const [metricsData, tokenData, accountData] = await Promise.all([
        adminApiRequest<MetricsResponse>("/admin/dashboard/metrics"),
        adminApiRequest<{ items: CdkItem[] }>("/admin/tokens"),
        fetchAdminAccounts(),
      ]);
      setMetrics(metricsData);
      setCdks(tokenData.items?.slice(0, 80) ?? []);
      setAccounts(
        (accountData || []).map((item: AdminAccountItem) => ({
          id: item.id,
          taskId: item.taskId,
          token: item.token,
          phoneLabel: item.phoneMasked || item.phone || "-",
          status: item.status,
        })),
      );
    } catch (error) {
      const text = toErrorMessage(error, "主页数据加载失败");
      setMessage(text);
      pushToast({ type: "error", title: "加载失败", message: text });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function buildCdkLink(token: string) {
    if (typeof window === "undefined") {
      return `/t/${token}`;
    }
    return `${window.location.origin}/t/${token}`;
  }

  async function createQuickCdk() {
    setQuickCreating(true);
    try {
      const data = await adminApiRequest<{ token: string }>("/admin/tokens", {
        method: "POST",
        body: { expiresInMinutes: 60 },
      });
      const copied = await copyToClipboard(buildCdkLink(data.token));
      pushToast({
        type: "success",
        title: "CDK 已创建",
        message: copied ? "开通链接已自动复制。" : "已创建，请手动复制链接。",
      });
      await loadData();
    } catch (error) {
      const text = toErrorMessage(error, "新增 CDK 失败");
      pushToast({ type: "error", title: "操作失败", message: text });
    } finally {
      setQuickCreating(false);
    }
  }

  async function copyCdkLink(token: string) {
    try {
      const copied = await copyToClipboard(buildCdkLink(token));
      pushToast({
        type: copied ? "success" : "warning",
        title: copied ? "复制成功" : "复制失败",
        message: copied ? "客户链接已复制。" : "当前环境不支持自动复制。",
      });
    } catch {
      pushToast({ type: "error", title: "复制失败", message: "请手动复制该链接。" });
    }
  }

  function jumpToAccount(item: SearchCandidate) {
    setSearchKeyword(item.token);
    setSearchFocused(false);
    router.push(`/admin/accounts?focus=${encodeURIComponent(item.id)}&q=${encodeURIComponent(item.token)}`);
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h1 className="h-display section-title">主页</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              快速检索手机号/CDK、查看日维度运行快照，并在此直接创建 CDK。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="button" disabled={quickCreating} onClick={() => void createQuickCdk()}>
              {quickCreating ? "创建中..." : "快速新增 CDK"}
            </button>
            <Link className="btn-pill" href="/admin/todo">
              进入待办中心
            </Link>
          </div>
        </div>

        <div className="mt-4 relative">
          <input
            className="field h-11 w-full"
            placeholder="快速搜索手机号或 CDK，回车前可直接点下拉项跳转"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              window.setTimeout(() => setSearchFocused(false), 120);
            }}
          />
          {searchFocused ? (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-[12px] border border-[var(--card-border)] bg-white shadow-[0_12px_26px_rgba(0,0,0,0.12)]">
              <div className="max-h-72 overflow-auto p-2">
                {filteredCandidates.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-[var(--text-muted)]">暂无匹配账户</p>
                ) : (
                  filteredCandidates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={() => jumpToAccount(item)}
                      className="w-full rounded-[10px] px-3 py-2 text-left hover:bg-[var(--surface-quiet)]"
                    >
                      <p className="text-sm text-[var(--page-text)]">{item.phoneLabel}</p>
                      <p className="font-mono text-xs text-[var(--text-muted)]">{item.token}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <article key={item.label} className="metric-card">
            <p className="text-sm text-[var(--text-muted)]">{item.label}</p>
            <p className="h-display mt-2 text-3xl font-semibold text-[var(--page-text)]">{item.value}</p>
            <div className="metric-card-line" style={{ background: item.line }} />
          </article>
        ))}
      </div>

      <article className="apple-panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="h-display text-xl font-semibold">运行快照（日维度）</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              统计近 7 天 CDK 创建、登录提交、成功开通、失败反馈。
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-[#2b6cb0]" />
              提交
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-[#00754a]" />
              成功
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-[#b5474f]" />
              失败
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-[#cba258]" />
              新增 CDK
            </span>
          </div>
        </div>

        <div className="grid gap-4">
          {snapshotRows.map((row) => (
            <div key={row.date} className="rounded-[12px] border border-[var(--card-border)] bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-[var(--page-text)]">{formatDayLabel(row.date)}</span>
                <span className="text-[var(--text-muted)]">
                  查询失败率：{metrics ? `${(metrics.queryFailRate * 100).toFixed(2)}%` : "-"}
                </span>
              </div>
              <div className="grid gap-2">
                <div className="chart-row">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>提交</span>
                    <span>{row.submissionCount}</span>
                  </div>
                  <div className="chart-track">
                    <div className="chart-fill bg-[#2b6cb0]" style={{ width: `${Math.max(4, (row.submissionCount / chartMax) * 100)}%` }} />
                  </div>
                </div>
                <div className="chart-row">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>成功</span>
                    <span>{row.completedCount}</span>
                  </div>
                  <div className="chart-track">
                    <div className="chart-fill bg-[#00754a]" style={{ width: `${Math.max(4, (row.completedCount / chartMax) * 100)}%` }} />
                  </div>
                </div>
                <div className="chart-row">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>失败</span>
                    <span>{row.failedCount}</span>
                  </div>
                  <div className="chart-track">
                    <div className="chart-fill bg-[#b5474f]" style={{ width: `${Math.max(4, (row.failedCount / chartMax) * 100)}%` }} />
                  </div>
                </div>
                <div className="chart-row">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>新增 CDK</span>
                    <span>{row.tokenCreated}</span>
                  </div>
                  <div className="chart-track">
                    <div className="chart-fill bg-[#cba258]" style={{ width: `${Math.max(4, (row.tokenCreated / chartMax) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {snapshotRows.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">暂无日维度统计数据。</p>
          ) : null}
        </div>
      </article>

      <article className="apple-panel p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="h-display text-xl font-semibold">CDK 列表</h2>
          <span className="text-sm text-[var(--text-muted)]">
            显示最近 {Math.min(80, cdks.length)} 条
          </span>
        </div>
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
                  <td>
                    <span className="status-pill">{cdkStatusLabel(item.status)}</span>
                  </td>
                  <td>{formatDate(item.expiresAt)}</td>
                  <td>
                    <button className="btn-pill h-9" type="button" onClick={() => void copyCdkLink(item.token)}>
                      复制链接
                    </button>
                  </td>
                </tr>
              ))}
              {cdks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-[var(--text-muted)]">
                    暂无 CDK 记录。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      {loading ? <p className="text-sm text-[var(--text-muted)]">加载中...</p> : null}
      {message ? (
        <div className="rounded-[12px] border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-[var(--text-muted)]">
          {message}
        </div>
      ) : null}
    </section>
  );
}
