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
  if (status === "completed") return "充值成功";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  return status;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function TodoPage() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [channels, setChannels] = useState<string[]>(["网页", "联想", "Android"]);
  const [selectedChannel, setSelectedChannel] = useState("网页");
  const [message, setMessage] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [capabilityResult, setCapabilityResult] = useState<BatchCapabilityResponse | null>(null);
  const [generateResult, setGenerateResult] = useState<BatchGenerateResponse | null>(null);
  const [feedbackMenuTaskId, setFeedbackMenuTaskId] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<{ token: string; payload: string } | null>(null);

  const todoTasks = useMemo(
    () =>
      tasks.filter(
        (item) => item.status === "pending" || item.status === "link_generated" || item.status === "processing",
      ),
    [tasks],
  );

  const allVisibleSelected = useMemo(
    () => todoTasks.length > 0 && todoTasks.every((item) => selectedTaskIds.includes(item.id)),
    [selectedTaskIds, todoTasks],
  );

  async function load() {
    try {
      const [taskData, channelData] = await Promise.all([
        adminApiRequest<{ items: TodoTask[] }>("/admin/recharge/tasks"),
        adminApiRequest<RechargeChannelResponse>("/admin/recharge/channels"),
      ]);
      setTasks(taskData.items);
      setChannels(channelData.channels);
      if (!channelData.channels.includes(selectedChannel)) {
        setSelectedChannel(channelData.channels[0] ?? "网页");
      }
    } catch (error) {
      const text = toErrorMessage(error, "加载待办数据失败");
      setMessage(text);
      pushToast({ type: "error", title: "加载失败", message: text });
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onWindowClick() {
      setFeedbackMenuTaskId(null);
    }
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, []);

  function toggleSelect(taskId: string) {
    setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
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

  async function runBatchCapability() {
    if (selectedTaskIds.length === 0) {
      const text = "请先选择至少一个待办任务。";
      setMessage(text);
      pushToast({ type: "warning", title: "无法执行", message: text });
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
        title: "批量查询完成",
        message: `${data.success}/${data.total} 个账户可开通`,
      });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "批量查询可开通接口失败");
      setMessage(text);
      pushToast({ type: "error", title: "批量查询失败", message: text });
    } finally {
      setBatchBusy(false);
    }
  }

  async function runBatchGenerateLinks() {
    if (selectedTaskIds.length === 0) {
      const text = "请先选择至少一个待办任务。";
      setMessage(text);
      pushToast({ type: "warning", title: "无法执行", message: text });
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
        title: "批量生成完成",
        message: `${data.success}/${data.total} 条生成成功`,
      });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "批量生成开通链接失败");
      setMessage(text);
      pushToast({ type: "error", title: "生成失败", message: text });
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
      pushToast({ type: "success", title: "已生成链接", message: "开通链接生成成功。" });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "生成开通链接失败");
      setMessage(text);
      pushToast({ type: "error", title: "生成失败", message: text });
    }
  }

  async function refreshVip(taskId: string) {
    setMessage("");
    try {
      await adminApiRequest(`/admin/recharge/tasks/${taskId}/refresh-vip`, {
        method: "POST",
      });
      pushToast({ type: "success", title: "刷新成功", message: "VIP 信息已刷新。" });
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "刷新 VIP 失败");
      setMessage(text);
      pushToast({ type: "error", title: "刷新失败", message: text });
    }
  }

  async function markFeedback(taskId: string, type: "success" | "failed" | "captcha") {
    let status: "completed" | "failed" = "completed";
    let remark = "充值成功";
    if (type === "failed") {
      status = "failed";
      remark = "充值失败";
    }
    if (type === "captcha") {
      status = "failed";
      remark = "验证码错误";
    }

    try {
      await adminApiRequest(`/admin/recharge/tasks/${taskId}/status`, {
        method: "POST",
        body: { status, remark },
      });
      pushToast({ type: "success", title: "反馈已记录", message: `状态更新为：${remark}` });
      setFeedbackMenuTaskId(null);
      await load();
    } catch (error) {
      const text = toErrorMessage(error, "提交反馈失败");
      pushToast({ type: "error", title: "反馈失败", message: text });
    }
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-5">
        <div className="grid gap-3 md:grid-cols-[240px_1fr_1fr]">
          <select
            id="channel-select"
            className="field h-11 w-full"
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
          >
            {channels.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button className="btn-pill h-11 w-full" type="button" disabled={batchBusy} onClick={() => void runBatchCapability()}>
            批量查询可开通接口
          </button>
          <button className="btn-primary h-11 w-full" type="button" disabled={batchBusy} onClick={() => void runBatchGenerateLinks()}>
            批量生成开通链接
          </button>
        </div>
      </article>

      <article className="apple-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="h-display text-2xl font-semibold">等待开号列表</h1>
          <span className="text-sm text-[var(--text-muted)]">已选任务：{selectedTaskIds.length}</span>
        </div>
        <div className="table-shell todo-table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                </th>
                <th className="min-w-[120px]">手机号</th>
                <th className="min-w-[220px]">CDK</th>
                <th className="min-w-[96px]">状态</th>
                <th className="min-w-[200px]">可用渠道</th>
                <th className="min-w-[96px]">当前渠道</th>
                <th className="min-w-[240px]">接口提示</th>
                <th className="min-w-[130px]">VIP</th>
                <th className="min-w-[100px]">二维码</th>
                <th className="min-w-[170px]">更新时间</th>
                <th className="min-w-[210px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {todoTasks.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input type="checkbox" checked={selectedTaskIds.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                  </td>
                  <td>{item.phoneMasked}</td>
                  <td className="font-mono">{item.token}</td>
                  <td>
                    <span className="status-pill">{taskStatusLabel(item.status)}</span>
                  </td>
                  <td>{item.availableChannels?.join(" / ") || "-"}</td>
                  <td>{item.selectedChannel || "-"}</td>
                  <td className="max-w-[300px] whitespace-normal break-all">{item.apiMessage || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="cursor-pointer text-[var(--brand-green-accent)] hover:underline"
                      onClick={() => void refreshVip(item.id)}
                    >
                      {item.hasUserVip || item.hasWinkVip
                        ? `User:${item.hasUserVip ? "Y" : "N"} Wink:${item.hasWinkVip ? "Y" : "N"}`
                        : "刷新 VIP"}
                    </button>
                  </td>
                  <td>
                    {item.qrPayload ? (
                      <button
                        type="button"
                        className="inline-flex rounded-[10px] border border-[var(--card-border)] bg-white p-1"
                        onClick={() => setQrPreview({ token: item.token, payload: item.qrPayload || "" })}
                        title="点击放大二维码"
                      >
                        <Image
                          src={item.qrPayload}
                          alt="充值二维码缩略图"
                          width={48}
                          height={48}
                          unoptimized
                          className="h-12 w-12 object-contain"
                        />
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{formatDate(item.updatedAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn-pill h-9 min-w-[94px]" onClick={() => void generateLink(item.id)} type="button">
                        生成连接
                      </button>
                      <div className="relative">
                        <button
                          className="btn-primary h-9 min-w-[94px]"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setFeedbackMenuTaskId((prev) => (prev === item.id ? null : item.id));
                          }}
                        >
                          标记反馈
                        </button>
                        {feedbackMenuTaskId === item.id ? (
                          <div
                            className="absolute right-0 top-[calc(100%+6px)] z-10 w-36 rounded-[10px] border border-[var(--card-border)] bg-white p-1 shadow-[0_12px_20px_rgba(0,0,0,0.12)]"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button className="w-full rounded-[8px] px-2 py-2 text-left text-sm hover:bg-[var(--surface-quiet)]" type="button" onClick={() => void markFeedback(item.id, "success")}>
                              充值成功
                            </button>
                            <button className="w-full rounded-[8px] px-2 py-2 text-left text-sm hover:bg-[var(--surface-quiet)]" type="button" onClick={() => void markFeedback(item.id, "failed")}>
                              充值失败
                            </button>
                            <button className="w-full rounded-[8px] px-2 py-2 text-left text-sm hover:bg-[var(--surface-quiet)]" type="button" onClick={() => void markFeedback(item.id, "captcha")}>
                              验证码错误
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {todoTasks.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-[var(--text-muted)]">
                    当前没有待处理开号任务。
                  </td>
                </tr>
              ) : null}
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
