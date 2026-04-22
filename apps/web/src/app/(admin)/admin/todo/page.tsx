"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { adminApiRequest } from "@/lib/admin-api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type TodoTask = {
  id: string;
  phoneMasked: string;
  token: string;
  status: string;
  rechargeLink?: string | null;
  qrPayload?: string | null;
  remark?: string | null;
  updatedAt: string;
};

type CdkItem = {
  id: string;
  token: string;
  status: string;
  expiresAt: string;
};

type RechargeChannelResponse = {
  channels: string[];
};

function taskStatusLabel(status: string) {
  if (status === "pending") return "待处理";
  if (status === "link_generated") return "已生成链接";
  if (status === "processing") return "处理中";
  if (status === "completed") return "已开";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  return status;
}

function tokenStatusLabel(status: string) {
  if (status === "active") return "可用";
  if (status === "consumed") return "已使用";
  if (status === "expired") return "已过期";
  if (status === "revoked") return "已封禁";
  return status;
}

export default function TodoPage() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [cdks, setCdks] = useState<CdkItem[]>([]);
  const [channels, setChannels] = useState<string[]>(["网页", "联想", "Android"]);
  const [selectedChannel, setSelectedChannel] = useState("网页");
  const [useExternalApi, setUseExternalApi] = useState(false);
  const [externalAccessToken, setExternalAccessToken] = useState("");
  const [externalCookie, setExternalCookie] = useState("");
  const [message, setMessage] = useState("");

  const pendingTasks = useMemo(() => tasks.filter((item) => item.status === "pending"), [tasks]);

  async function load() {
    try {
      const [taskData, cdkData, channelData] = await Promise.all([
        adminApiRequest<{ items: TodoTask[] }>("/admin/recharge/tasks"),
        adminApiRequest<{ items: CdkItem[] }>("/admin/tokens"),
        adminApiRequest<RechargeChannelResponse>("/admin/recharge/channels"),
      ]);
      setTasks(taskData.items);
      setCdks(cdkData.items);
      setChannels(channelData.channels);
      if (!channelData.channels.includes(selectedChannel)) {
        setSelectedChannel(channelData.channels[0] ?? "网页");
      }
    } catch (error) {
      setMessage(toErrorMessage(error, "加载待办数据失败"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function buildCdkLink(token: string) {
    if (typeof window === "undefined") {
      return `/t/${token}`;
    }
    return `${window.location.origin}/t/${token}`;
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

  async function createCdk() {
    setMessage("");
    try {
      const created = await adminApiRequest<{ token: string }>("/admin/tokens", {
        method: "POST",
        body: { expiresInMinutes: 60 },
      });
      const link = buildCdkLink(created.token);
      const copied = await copyToClipboard(link);
      pushToast({
        type: "success",
        message: copied ? "CDK 已创建，完整链接已复制。" : "CDK 已创建，请手动复制完整链接。",
      });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "新增 CDK 失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  async function copyCdkLink(token: string) {
    setMessage("");
    try {
      const copied = await copyToClipboard(buildCdkLink(token));
      pushToast({ type: copied ? "success" : "error", message: copied ? "CDK 链接已复制。" : "复制失败。" });
    } catch {
      pushToast({ type: "error", message: "复制失败，请手动复制。" });
    }
  }

  async function copyRechargeLink(link?: string | null) {
    if (!link) {
      pushToast({ type: "info", message: "当前任务还没有充值链接。" });
      return;
    }
    try {
      const copied = await copyToClipboard(link);
      pushToast({ type: copied ? "success" : "error", message: copied ? "充值链接已复制。" : "充值链接复制失败。" });
    } catch {
      pushToast({ type: "error", message: "充值链接复制失败。" });
    }
  }

  function openQr(qrPayload?: string | null) {
    if (!qrPayload || typeof window === "undefined") {
      pushToast({ type: "info", message: "当前任务没有二维码。" });
      return;
    }
    window.open(qrPayload, "_blank", "noopener,noreferrer");
  }

  async function generateLink(taskId: string) {
    setMessage("");
    try {
      await adminApiRequest(`/admin/recharge/tasks/${taskId}/generate-link`, {
        method: "POST",
        body: {
          useExternalApi,
          channel: selectedChannel,
          accessToken: externalAccessToken.trim(),
          cookie: externalCookie.trim(),
        },
      });
      pushToast({ type: "success", message: useExternalApi ? "外部充值链接生成成功。" : "本地充值链接生成成功。" });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "生成充值链接失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  async function completeTask(taskId: string) {
    setMessage("");
    try {
      await adminApiRequest(`/admin/recharge/tasks/${taskId}/status`, {
        method: "POST",
        body: { status: "completed", remark: "manual done" },
      });
      pushToast({ type: "success", message: "已标记为已开。" });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "更新待办状态失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="h-display section-title">待办中心</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              处理待开号任务、生成充值链接、复制客户访问地址。
            </p>
          </div>
          <button className="btn-primary" onClick={() => void createCdk()} type="button">
            新增 CDK（1 小时）
          </button>
        </div>
      </article>

      <article className="apple-panel p-6">
        <h2 className="h-display text-2xl font-semibold">充值对接配置</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          渠道列表来自服务端文件配置。页面只做读取和使用，不提供编辑入口。
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-4">
            <label className="mb-2 block text-sm text-[var(--text-muted)]" htmlFor="channel-select">
              充值渠道
            </label>
            <select
              id="channel-select"
              className="field w-full"
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
            >
              {channels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-4">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <input type="checkbox" checked={useExternalApi} onChange={(e) => setUseExternalApi(e.target.checked)} />
              使用外部充值 API
            </label>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">关闭时生成本地充值链接；开启时走外部充值链路。</p>
          </div>

          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-4">
            <input
              className="field w-full"
              placeholder="Access-Token（外部模式必填）"
              value={externalAccessToken}
              onChange={(e) => setExternalAccessToken(e.target.value)}
            />
            <input
              className="field mt-2 w-full"
              placeholder="Cookie（可选）"
              value={externalCookie}
              onChange={(e) => setExternalCookie(e.target.value)}
            />
          </div>
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">等待开号列表</h2>
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>手机号</th>
                <th>CDK</th>
                <th>完整链接</th>
                <th>充值链接</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pendingTasks.map((item) => (
                <tr key={item.id}>
                  <td>{item.phoneMasked}</td>
                  <td className="font-mono">{item.token}</td>
                  <td className="font-mono text-xs">{buildCdkLink(item.token)}</td>
                  <td className="font-mono text-xs">{item.rechargeLink || "-"}</td>
                  <td>
                    <span className="status-pill">{taskStatusLabel(item.status)}</span>
                  </td>
                  <td>{new Date(item.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn-pill" onClick={() => void copyCdkLink(item.token)} type="button">
                        复制链接
                      </button>
                      <button className="btn-pill" onClick={() => void copyRechargeLink(item.rechargeLink)} type="button">
                        复制充值
                      </button>
                      <button className="btn-pill" onClick={() => openQr(item.qrPayload)} type="button">
                        查看二维码
                      </button>
                      <button className="btn-pill" onClick={() => void generateLink(item.id)} type="button">
                        生成充值
                      </button>
                      <button className="btn-primary" onClick={() => void completeTask(item.id)} type="button">
                        标记已开
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pendingTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-[var(--text-muted)]">
                    当前没有待处理开号任务。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">CDK 列表</h2>
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>CDK</th>
                <th>完整链接</th>
                <th>状态</th>
                <th>过期时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {cdks.map((item) => (
                <tr key={item.id}>
                  <td className="font-mono">{item.token}</td>
                  <td className="font-mono text-xs">{buildCdkLink(item.token)}</td>
                  <td>{tokenStatusLabel(item.status)}</td>
                  <td>{new Date(item.expiresAt).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn-pill" onClick={() => void copyCdkLink(item.token)} type="button">
                        复制完整链接
                      </button>
                    </div>
                  </td>
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
