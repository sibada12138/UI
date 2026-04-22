"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { adminApiRequest } from "@/lib/admin-api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type TodoTask = {
  id: string;
  phoneMasked: string;
  token: string;
  status: string;
  apiStatus: string;
  apiMessage?: string | null;
  availableChannels?: string[];
  selectedChannel?: string | null;
  lastApiAt?: string | null;
  lastPriceValue?: number | null;
  rechargeLink?: string | null;
  qrPayload?: string | null;
  remark?: string | null;
  vipFetchedAt?: string | null;
  hasUserVip?: boolean;
  hasWinkVip?: boolean;
  externalUid?: string | null;
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

type BatchCapabilityItem = {
  taskId: string;
  token: string | null;
  canOpen: boolean;
  selectedChannel: string | null;
  availableChannels: string[];
  message: string;
  results: Array<{
    channel: string;
    canRecharge: boolean;
    priceValue: number | null;
    reason: string;
  }>;
};

type BatchCapabilityResponse = {
  total: number;
  success: number;
  items: BatchCapabilityItem[];
};

type BatchGenerateResponse = {
  total: number;
  success: number;
  items: Array<{
    taskId: string;
    success: boolean;
    message: string;
    rechargeLink: string | null;
    selectedChannel: string | null;
    fallbackUsed: boolean;
  }>;
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

function apiStatusLabel(status: string) {
  if (status === "idle") return "未检测";
  if (status === "ready") return "可检测";
  if (status === "vip_fetch_failed") return "VIP获取失败";
  if (status === "missing_access_token") return "无访问令牌";
  if (status === "channel_ready") return "可开通";
  if (status === "channel_unavailable") return "不可开通";
  if (status === "recharge_link_generated") return "链接已生成";
  return status;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function TodoPage() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [cdks, setCdks] = useState<CdkItem[]>([]);
  const [channels, setChannels] = useState<string[]>(["网页", "联想", "Android"]);
  const [selectedChannel, setSelectedChannel] = useState("网页");
  const [message, setMessage] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [capabilityResult, setCapabilityResult] = useState<BatchCapabilityResponse | null>(null);
  const [generateResult, setGenerateResult] = useState<BatchGenerateResponse | null>(null);

  const [qrPreview, setQrPreview] = useState<{ token: string; payload: string } | null>(null);

  const todoTasks = useMemo(
    () =>
      tasks.filter(
        (item) =>
          item.status === "pending" ||
          item.status === "link_generated" ||
          item.status === "processing",
      ),
    [tasks],
  );

  const allVisibleSelected = useMemo(
    () =>
      todoTasks.length > 0 && todoTasks.every((item) => selectedTaskIds.includes(item.id)),
    [selectedTaskIds, todoTasks],
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const copied = await copyToClipboard(buildCdkLink(created.token));
      pushToast({
        type: "success",
        message: copied ? "CDK 已创建，链接已复制。" : "CDK 已创建。",
      });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "新增 CDK 失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  function toggleSelect(taskId: string) {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
  }

  function toggleSelectAllVisible() {
    setSelectedTaskIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !todoTasks.some((task) => task.id === id));
      }
      const merged = new Set([...prev, ...todoTasks.map((item) => item.id)]);
      return Array.from(merged);
    });
  }

  async function copyRechargeLink(link?: string | null) {
    if (!link) {
      pushToast({ type: "info", message: "当前任务还没有充值链接。" });
      return;
    }
    try {
      const copied = await copyToClipboard(link);
      pushToast({
        type: copied ? "success" : "error",
        message: copied ? "充值链接已复制。" : "复制失败。",
      });
    } catch {
      pushToast({ type: "error", message: "充值链接复制失败。" });
    }
  }

  async function runBatchCapability() {
    if (selectedTaskIds.length === 0) {
      setMessage("请先选择至少一个待办任务。");
      return;
    }

    setBatchBusy(true);
    setMessage("");
    setGenerateResult(null);
    try {
      const data = await adminApiRequest<BatchCapabilityResponse>("/admin/recharge/tasks/batch/capability", {
        method: "POST",
        body: {
          taskIds: selectedTaskIds,
          preferredChannel: selectedChannel,
        },
      });
      setCapabilityResult(data);
      pushToast({
        type: "success",
        message: `查询完成：${data.success}/${data.total} 个账户可开通。`,
      });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "批量查询可开通接口失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setBatchBusy(false);
    }
  }

  async function runBatchGenerateLinks() {
    if (selectedTaskIds.length === 0) {
      setMessage("请先选择至少一个待办任务。");
      return;
    }

    setBatchBusy(true);
    setMessage("");
    setCapabilityResult(null);
    try {
      const data = await adminApiRequest<BatchGenerateResponse>("/admin/recharge/tasks/batch/generate-links", {
        method: "POST",
        body: {
          taskIds: selectedTaskIds,
          preferredChannel: selectedChannel,
        },
      });
      setGenerateResult(data);
      pushToast({
        type: "success",
        message: `批量生成完成：${data.success}/${data.total} 成功。`,
      });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "批量生成开通链接失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setBatchBusy(false);
    }
  }

  async function generateLink(taskId: string) {
    setMessage("");
    try {
      await adminApiRequest(`/admin/recharge/tasks/${taskId}/generate-link`, {
        method: "POST",
        body: {
          useExternalApi: true,
          channel: selectedChannel,
        },
      });
      pushToast({ type: "success", message: "开通链接生成成功。" });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "生成开通链接失败");
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
              多选账号后可批量查询可开通接口，并批量生成开通链接。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={() => void createCdk()} type="button">
              新增 CDK（1 小时）
            </button>
          </div>
        </div>
      </article>

      <article className="apple-panel p-5">
        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto_auto]">
          <div>
            <label className="mb-2 block text-sm text-[var(--text-muted)]" htmlFor="channel-select">
              默认充值渠道
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
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            <p>查询可开通接口：批量查询选中账户可使用的接口，若默认渠道价格不为 1.1 会自动切换最近可用渠道。</p>
            <p className="mt-1">已选任务数：{selectedTaskIds.length}</p>
          </div>
          <button className="btn-pill" type="button" disabled={batchBusy} onClick={() => void runBatchCapability()}>
            批量查询可开通接口
          </button>
          <button className="btn-primary" type="button" disabled={batchBusy} onClick={() => void runBatchGenerateLinks()}>
            批量生成开通链接
          </button>
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">等待开号列表</h2>
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                </th>
                <th className="min-w-[120px]">手机号</th>
                <th className="min-w-[220px]">CDK</th>
                <th className="min-w-[96px]">开号状态</th>
                <th className="min-w-[110px]">API 状态</th>
                <th className="min-w-[180px]">可用渠道</th>
                <th className="min-w-[96px]">当前渠道</th>
                <th className="min-w-[260px]">状态提示</th>
                <th className="min-w-[130px]">VIP</th>
                <th className="min-w-[220px]">开通链接</th>
                <th className="min-w-[170px]">更新时间</th>
                <th className="min-w-[220px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {todoTasks.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.includes(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </td>
                  <td>{item.phoneMasked}</td>
                  <td className="font-mono">{item.token}</td>
                  <td>
                    <span className="status-pill">{taskStatusLabel(item.status)}</span>
                  </td>
                  <td>{apiStatusLabel(item.apiStatus)}</td>
                  <td>{item.availableChannels?.join(" / ") || "-"}</td>
                  <td>{item.selectedChannel || "-"}</td>
                  <td className="max-w-[300px] whitespace-normal break-all">
                    {item.apiMessage || "-"}
                  </td>
                  <td>
                    {item.hasUserVip || item.hasWinkVip
                      ? `User:${item.hasUserVip ? "Y" : "N"} Wink:${item.hasWinkVip ? "Y" : "N"}`
                      : "-"}
                  </td>
                  <td className="max-w-[280px] whitespace-normal break-all">
                    {item.rechargeLink || "-"}
                  </td>
                  <td>{formatDate(item.updatedAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn-pill" onClick={() => void copyRechargeLink(item.rechargeLink)} type="button">
                        复制充值链接
                      </button>
                      <button
                        className="btn-pill"
                        onClick={() => item.qrPayload && setQrPreview({ token: item.token, payload: item.qrPayload })}
                        type="button"
                      >
                        充值二维码
                      </button>
                      <button className="btn-pill" onClick={() => void generateLink(item.id)} type="button">
                        生成开通链接
                      </button>
                      <button className="btn-primary" onClick={() => void completeTask(item.id)} type="button">
                        标记已开
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {todoTasks.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-[var(--text-muted)]">
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
                <th>状态</th>
                <th>过期时间</th>
              </tr>
            </thead>
            <tbody>
              {cdks.map((item) => (
                <tr key={item.id}>
                  <td className="font-mono">{item.token}</td>
                  <td>{tokenStatusLabel(item.status)}</td>
                  <td>{formatDate(item.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {capabilityResult ? (
        <article className="apple-panel p-4">
          <h2 className="text-xl font-semibold">批量接口查询结果</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            可开通 {capabilityResult.success}/{capabilityResult.total}
          </p>
          <div className="mt-3 table-shell">
            <table className="table-basic">
              <thead>
                <tr>
                  <th>任务ID</th>
                  <th>CDK</th>
                  <th>可开通</th>
                  <th>建议渠道</th>
                  <th>可用渠道</th>
                  <th>提示</th>
                </tr>
              </thead>
              <tbody>
                {capabilityResult.items.map((item) => (
                  <tr key={`cap-${item.taskId}`}>
                    <td className="font-mono">{item.taskId}</td>
                    <td className="font-mono">{item.token || "-"}</td>
                    <td>{item.canOpen ? "是" : "否"}</td>
                    <td>{item.selectedChannel || "-"}</td>
                    <td>{item.availableChannels.join(" / ") || "-"}</td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {generateResult ? (
        <article className="apple-panel p-4">
          <h2 className="text-xl font-semibold">批量生成结果</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            成功 {generateResult.success}/{generateResult.total}
          </p>
          <div className="mt-3 table-shell">
            <table className="table-basic">
              <thead>
                <tr>
                  <th>任务ID</th>
                  <th>结果</th>
                  <th>渠道</th>
                  <th>自动切换</th>
                  <th>提示</th>
                </tr>
              </thead>
              <tbody>
                {generateResult.items.map((item) => (
                  <tr key={`gen-${item.taskId}`}>
                    <td className="font-mono">{item.taskId}</td>
                    <td>{item.success ? "成功" : "失败"}</td>
                    <td>{item.selectedChannel || "-"}</td>
                    <td>{item.fallbackUsed ? "是" : "否"}</td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {message ? <p className="text-sm text-[var(--danger)]">{message}</p> : null}

      {qrPreview ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-[0_20px_55px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="h-display text-lg font-semibold">充值二维码</h3>
              <button className="btn-pill" onClick={() => setQrPreview(null)} type="button">
                关闭
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--text-muted)]">CDK：{qrPreview.token}</p>
            <div className="mt-3 rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-3">
              <Image
                src={qrPreview.payload}
                alt="充值二维码"
                width={260}
                height={260}
                unoptimized
                className="mx-auto h-64 w-64 object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
