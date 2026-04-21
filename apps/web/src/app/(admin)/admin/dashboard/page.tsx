"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getAdminToken } from "@/lib/admin-auth";

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
      .catch((error) => setMessage(error instanceof Error ? error.message : "Load failed"));
  }, []);

  const metricItems = metrics
    ? [
        { label: "Active Tokens", value: metrics.activeTokens },
        { label: "Consumed Today", value: metrics.consumedToday },
        { label: "Banned IPs", value: metrics.bannedIpCount },
        { label: "Pending Recharge", value: metrics.pendingRechargeTasks },
        { label: "Query Fail Rate", value: `${(metrics.queryFailRate * 100).toFixed(2)}%` },
      ]
    : [];

  return (
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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

