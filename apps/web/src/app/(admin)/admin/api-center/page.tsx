"use client";

import { useState } from "react";
import { adminApiRequest } from "@/lib/admin-api";
import { apiRequest } from "@/lib/api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type ProbeItem = {
  key: string;
  name: string;
  status: "idle" | "ok" | "fail" | "running";
  durationMs?: number;
  detail?: string;
};

const INITIAL_ITEMS: ProbeItem[] = [
  { key: "core-root", name: "公共根接口 /api", status: "idle" },
  { key: "admin-dashboard", name: "后台统计 /admin/dashboard/metrics", status: "idle" },
  { key: "admin-tokens", name: "CDK 列表 /admin/tokens", status: "idle" },
  { key: "admin-tasks", name: "待办列表 /admin/recharge/tasks", status: "idle" },
  { key: "admin-risk", name: "风控封禁 /admin/security/bans", status: "idle" },
  { key: "public-captcha", name: "查询验证码 /public/captcha/create", status: "idle" },
  { key: "external-bootstrap", name: "外部短信初始化 /admin/external/sms/bootstrap", status: "idle" },
  { key: "external-qr", name: "外部扫码初始化 /admin/external/qr/create", status: "idle" },
];

async function runProbe(key: string) {
  if (key === "core-root") {
    await apiRequest<string>("");
    return "OK";
  }
  if (key === "admin-dashboard") {
    await adminApiRequest("/admin/dashboard/metrics");
    return "OK";
  }
  if (key === "admin-tokens") {
    await adminApiRequest("/admin/tokens");
    return "OK";
  }
  if (key === "admin-tasks") {
    await adminApiRequest("/admin/recharge/tasks");
    return "OK";
  }
  if (key === "admin-risk") {
    await adminApiRequest("/admin/security/bans");
    return "OK";
  }
  if (key === "public-captcha") {
    await apiRequest("/public/captcha/create", { method: "POST" });
    return "OK";
  }
  if (key === "external-bootstrap") {
    await adminApiRequest("/admin/external/sms/bootstrap", {
      method: "POST",
      body: { deviceId: "api-center-check" },
    });
    return "OK";
  }
  if (key === "external-qr") {
    await adminApiRequest("/admin/external/qr/create", {
      method: "POST",
      body: { deviceId: "api-center-check" },
    });
    return "OK";
  }
  return "UNKNOWN";
}

export default function ApiCenterPage() {
  const [items, setItems] = useState<ProbeItem[]>(INITIAL_ITEMS);
  const [running, setRunning] = useState(false);

  async function runAll() {
    setRunning(true);
    setItems((prev) => prev.map((item) => ({ ...item, status: "idle", detail: "", durationMs: undefined })));
    for (const item of INITIAL_ITEMS) {
      setItems((prev) => prev.map((v) => (v.key === item.key ? { ...v, status: "running" } : v)));
      const start = Date.now();
      try {
        const detail = await runProbe(item.key);
        setItems((prev) =>
          prev.map((v) =>
            v.key === item.key
              ? { ...v, status: "ok", detail, durationMs: Date.now() - start }
              : v,
          ),
        );
      } catch (error) {
        setItems((prev) =>
          prev.map((v) =>
            v.key === item.key
              ? {
                  ...v,
                  status: "fail",
                  detail: toErrorMessage(error, "请求失败"),
                  durationMs: Date.now() - start,
                }
              : v,
          ),
        );
      }
    }
    setRunning(false);
    pushToast({ type: "info", message: "API 自检已完成。" });
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="h-display section-title">API 中心</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              一键测试核心接口和外部接口链路，快速定位是前端、后端还是外部网络问题。
            </p>
          </div>
          <button className="btn-primary" type="button" onClick={() => void runAll()} disabled={running}>
            {running ? "检测中..." : "开始全量检测"}
          </button>
        </div>
      </article>

      <article className="apple-panel p-4">
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>接口</th>
                <th>状态</th>
                <th>耗时</th>
                <th>结果详情</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td>{item.name}</td>
                  <td>
                    <span className="status-pill">
                      {item.status === "idle" && "待检测"}
                      {item.status === "running" && "检测中"}
                      {item.status === "ok" && "正常"}
                      {item.status === "fail" && "异常"}
                    </span>
                  </td>
                  <td>{item.durationMs ? `${item.durationMs} ms` : "-"}</td>
                  <td>{item.detail || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
