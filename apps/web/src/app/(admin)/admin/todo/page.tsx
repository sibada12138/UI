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

type CapabilityResult = {
  channel: string;
  canRecharge: boolean;
  reason: string;
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

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function TodoPage() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [cdks, setCdks] = useState<CdkItem[]>([]);
  const [channels, setChannels] = useState<string[]>(["网页", "联想", "Android"]);
  const [selectedChannel, setSelectedChannel] = useState("网页");
  const [message, setMessage] = useState("");

  const [useExternalApi, setUseExternalApi] = useState(false);
  const [externalModalOpen, setExternalModalOpen] = useState(false);
  const [externalAccessToken, setExternalAccessToken] = useState("");
  const [externalCookie, setExternalCookie] = useState("");
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilityResults, setCapabilityResults] = useState<CapabilityResult[]>([]);
  const [capabilitySummary, setCapabilitySummary] = useState("");

  const [qrPreview, setQrPreview] = useState<{ token: string; payload: string } | null>(null);

  const pendingTasks = useMemo(
    () => tasks.filter((item) => item.status === "pending" || item.status === "link_generated"),
    [tasks],
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
      pushToast({
        type: copied ? "success" : "error",
        message: copied ? "充值链接已复制。" : "充值链接复制失败。",
      });
    } catch {
      pushToast({ type: "error", message: "充值链接复制失败。" });
    }
  }

  async function checkCapability(checkAll: boolean) {
    if (!externalAccessToken.trim()) {
      setMessage("请先填写 Access-Token。");
      pushToast({ type: "error", message: "请先填写 Access-Token。" });
      return;
    }

    setCapabilityLoading(true);
    setMessage("");
    try {
      const data = await adminApiRequest<{
        channels: string[];
        results: CapabilityResult[];
      }>("/admin/recharge/tasks/capability/check", {
        method: "POST",
        body: {
          accessToken: externalAccessToken.trim(),
          cookie: externalCookie.trim(),
          checkAll,
          channel: selectedChannel,
        },
      });
      setCapabilityResults(data.results);
      const successCount = data.results.filter((item) => item.canRecharge).length;
      const summary = `检测完成：${successCount}/${data.results.length} 个渠道可充值。`;
      setCapabilitySummary(summary);
      pushToast({ type: "success", message: summary });
    } catch (error) {
      const text = toErrorMessage(error, "渠道检测失败");
      setCapabilitySummary("");
      setCapabilityResults([]);
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setCapabilityLoading(false);
    }
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
      pushToast({
        type: "success",
        message: useExternalApi ? "外部充值链接生成成功。" : "本地充值链接生成成功。",
      });
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
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={() => void createCdk()} type="button">
              新增 CDK（1 小时）
            </button>
            <button className="btn-pill" onClick={() => setExternalModalOpen(true)} type="button">
              外部账号充值配置
            </button>
          </div>
        </div>
      </article>

      <article className="apple-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="h-display text-2xl font-semibold">充值模式</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              渠道列表来自服务端配置文件。可在外部账号模式和本地模式之间切换。
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-[var(--card-border)] bg-[var(--card-bg-soft)] px-3 py-2">
            <span className="text-sm text-[var(--text-muted)]">外部充值</span>
            <button
              type="button"
              className={`h-6 w-12 rounded-full border transition ${
                useExternalApi
                  ? "border-[var(--brand-green-accent)] bg-[var(--brand-green-accent)]"
                  : "border-[var(--card-border)] bg-white"
              }`}
              onClick={() => setUseExternalApi((prev) => !prev)}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition ${
                  useExternalApi ? "translate-x-[22px]" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[260px_1fr]">
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
            <p>当前模式：{useExternalApi ? "外部账号充值（需要 Access-Token）" : "本地链接模式"}</p>
            <p className="mt-1">外部模式下可在弹窗中检测全部渠道或单渠道可用性。</p>
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
                  <td>{formatDate(item.updatedAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn-pill" onClick={() => void copyCdkLink(item.token)} type="button">
                        复制客户链接
                      </button>
                      <button className="btn-pill" onClick={() => void copyRechargeLink(item.rechargeLink)} type="button">
                        复制充值链接
                      </button>
                      <button
                        className="btn-pill"
                        onClick={() => item.qrPayload && setQrPreview({ token: item.token, payload: item.qrPayload })}
                        type="button"
                      >
                        查看充值二维码
                      </button>
                      <button className="btn-pill" onClick={() => void generateLink(item.id)} type="button">
                        生成充值链接
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
                  <td>{formatDate(item.expiresAt)}</td>
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

      {externalModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-[0_20px_55px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="h-display text-xl font-semibold">外部账号充值配置</h3>
              <button className="btn-pill" onClick={() => setExternalModalOpen(false)} type="button">
                关闭
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <input
                className="field"
                placeholder="Access-Token（必填）"
                value={externalAccessToken}
                onChange={(e) => setExternalAccessToken(e.target.value)}
              />
              <textarea
                className="field min-h-24 py-2"
                placeholder="Cookie（可选）"
                value={externalCookie}
                onChange={(e) => setExternalCookie(e.target.value)}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="btn-primary"
                type="button"
                onClick={() => void checkCapability(true)}
                disabled={capabilityLoading}
              >
                {capabilityLoading ? "检测中..." : "检测全部渠道"}
              </button>
              <button
                className="btn-pill"
                type="button"
                onClick={() => void checkCapability(false)}
                disabled={capabilityLoading}
              >
                检测当前渠道（{selectedChannel}）
              </button>
            </div>

            {capabilitySummary ? <p className="mt-3 text-sm text-[var(--text-muted)]">{capabilitySummary}</p> : null}
            {capabilityResults.length > 0 ? (
              <div className="mt-3 table-shell">
                <table className="table-basic">
                  <thead>
                    <tr>
                      <th>渠道</th>
                      <th>结果</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capabilityResults.map((item) => (
                      <tr key={item.channel}>
                        <td>{item.channel}</td>
                        <td>{item.canRecharge ? "可充值" : "不可充值"}</td>
                        <td>{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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
