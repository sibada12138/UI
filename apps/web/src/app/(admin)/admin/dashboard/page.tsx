"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getAdminToken } from "@/lib/admin-auth";
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
    const token = getAdminToken();
    void apiRequest<Metrics>("/admin/dashboard/metrics", { token })
      .then(setMetrics)
      .catch((error) => setMessage(toErrorMessage(error, "加载失败")));
  }, []);

  const metricItems = metrics
    ? [
        { label: "有效 Token", value: metrics.activeTokens },
        { label: "今日提交成功", value: metrics.consumedToday },
        { label: "当前封禁 IP", value: metrics.bannedIpCount },
        { label: "待处理充值工单", value: metrics.pendingRechargeTasks },
        { label: "查询失败率", value: `${(metrics.queryFailRate * 100).toFixed(2)}%` },
      ]
    : [];

  return (
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <article className="apple-panel p-6 md:col-span-2 xl:col-span-3">
        <h1 className="h-display text-4xl font-semibold">系统运行总览</h1>
        <p className="mt-3 text-sm text-[var(--text-subtle)]">
          监控 token 消耗、查询失败率、封禁数量和充值工单积压，便于快速分配客服处理资源。
        </p>
      </article>
      {metricItems.map((item) => (
        <article key={item.label} className="apple-panel p-6">
          <p className="text-sm text-[var(--text-subtle)]">{item.label}</p>
          <p className="h-display mt-3 text-4xl font-semibold">{item.value}</p>
        </article>
      ))}
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </section>
  );
}
