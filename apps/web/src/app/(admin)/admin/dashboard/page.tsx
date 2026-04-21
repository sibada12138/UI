"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApiRequest } from "@/lib/admin-api";
import { toErrorMessage } from "@/lib/error-message";

type Metrics = {
  activeTokens: number;
  consumedToday: number;
  queryFailRate: number;
  bannedIpCount: number;
  pendingRechargeTasks: number;
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void adminApiRequest<Metrics>("/admin/dashboard/metrics")
      .then(setMetrics)
      .catch((error) => setMessage(toErrorMessage(error, "加载主页数据失败")));
  }, []);

  const cards = metrics
    ? [
        { label: "可用 CDK", value: metrics.activeTokens },
        { label: "今日成功提交", value: metrics.consumedToday },
        { label: "待处理开号", value: metrics.pendingRechargeTasks },
        { label: "封禁 IP 数", value: metrics.bannedIpCount },
        { label: "查询失败率", value: `${(metrics.queryFailRate * 100).toFixed(2)}%` },
      ]
    : [];
  const chartRows = metrics
    ? [
        { label: "可用 CDK", value: metrics.activeTokens },
        { label: "今日提交", value: metrics.consumedToday },
        { label: "待办任务", value: metrics.pendingRechargeTasks },
        { label: "封禁 IP", value: metrics.bannedIpCount },
      ]
    : [];
  const chartMax = Math.max(1, ...chartRows.map((item) => item.value));

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-6">
        <h1 className="h-display section-title">主页</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          统一查看系统状态，快速进入账户、待办和风控处理。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="btn-primary" href="/admin/todo">
            进入待办中心
          </Link>
          <Link className="btn-pill" href="/admin/risk">
            前往风控中心
          </Link>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((item) => (
          <article key={item.label} className="apple-panel p-5">
            <p className="text-sm text-[var(--text-muted)]">{item.label}</p>
            <p className="h-display mt-3 text-3xl font-semibold">{item.value}</p>
          </article>
        ))}
      </div>
      <article className="apple-panel p-5">
        <h2 className="h-display text-xl font-semibold">运行快照图</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          展示当前关键指标占比，便于手机端快速判断是否有堆积风险。
        </p>
        <div className="mt-4 grid gap-3">
          {chartRows.map((item) => (
            <div key={item.label} className="grid gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">{item.label}</span>
                <span className="font-semibold text-[var(--page-text)]">{item.value}</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--surface-quiet)]">
                <div
                  className="h-full rounded-full bg-[var(--brand-green-accent)] transition-all"
                  style={{ width: `${Math.max(8, Math.round((item.value / chartMax) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>

      {message ? <p className="text-sm text-[var(--danger)]">{message}</p> : null}
    </section>
  );
}
