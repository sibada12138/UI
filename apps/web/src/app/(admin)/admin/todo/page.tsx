"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { adminApiRequest } from "@/lib/admin-api";
import { toErrorMessage } from "@/lib/error-message";

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

export default function TodoPage() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [cdks, setCdks] = useState<CdkItem[]>([]);
  const [channels, setChannels] = useState<string[]>(["网页", "联想", "Android"]);
  const [channelInput, setChannelInput] = useState("网页\n联想\nAndroid");
  const [selectedChannel, setSelectedChannel] = useState("网页");
  const [useExternalApi, setUseExternalApi] = useState(false);
  const [externalAccessToken, setExternalAccessToken] = useState("");
  const [externalCookie, setExternalCookie] = useState("");
  const [message, setMessage] = useState("");

  const pendingTasks = useMemo(
    () => tasks.filter((item) => item.status === "pending"),
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
      setChannelInput(channelData.channels.join("\n"));
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
        body: { expiresInMinutes: 30 },
      });
      const link = buildCdkLink(created.token);
      const copied = await copyToClipboard(link);
      setMessage(copied ? `新增成功，链接已复制：${link}` : `新增成功，请手动复制：${link}`);
      await load();
    } catch (error) {
      setMessage(toErrorMessage(error, "新增 CDK 失败"));
    }
  }

  async function copyCdkLink(token: string) {
    setMessage("");
    try {
      const copied = await copyToClipboard(buildCdkLink(token));
      setMessage(copied ? "链接已复制，可直接发给客户。" : "复制失败，请手动复制链接。");
    } catch {
      setMessage("复制失败，请手动复制链接。");
    }
  }

  async function copyRechargeLink(link?: string | null) {
    if (!link) {
      setMessage("当前任务还没有充值链接。");
      return;
    }
    setMessage("");
    try {
      const copied = await copyToClipboard(link);
      setMessage(copied ? "充值链接已复制。" : "充值链接复制失败。");
    } catch {
      setMessage("充值链接复制失败。");
    }
  }

  function openQr(qrPayload?: string | null) {
    if (!qrPayload || typeof window === "undefined") {
      setMessage("当前任务没有二维码。");
      return;
    }
    window.open(qrPayload, "_blank", "noopener,noreferrer");
  }

  async function saveChannels() {
    setMessage("");
    const nextChannels = channelInput
      .split(/\r?\n/g)
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      const data = await adminApiRequest<RechargeChannelResponse>("/admin/recharge/channels", {
        method: "POST",
        body: { channels: nextChannels },
      });
      setChannels(data.channels);
      setChannelInput(data.channels.join("\n"));
      setSelectedChannel(data.channels[0] ?? "网页");
      setMessage("充值渠道已保存。");
    } catch (error) {
      setMessage(toErrorMessage(error, "保存充值渠道失败"));
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
      setMessage(useExternalApi ? "外部充值链接生成成功。" : "本地充值链接生成成功。");
      await load();
    } catch (error) {
      setMessage(toErrorMessage(error, "生成充值链接失败"));
    }
  }

  async function completeTask(taskId: string) {
    setMessage("");
    try {
      await adminApiRequest(`/admin/recharge/tasks/${taskId}/status`, {
        method: "POST",
        body: { status: "completed", remark: "manual done" },
      });
      await load();
    } catch (error) {
      setMessage(toErrorMessage(error, "更新待办状态失败"));
    }
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="h-display section-title">待办中心</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              包含等待开号列表与新增 CDK。客服按待办顺序处理并回填状态。
            </p>
          </div>
          <button className="btn-primary" onClick={() => void createCdk()} type="button">
            新增 CDK（30 分钟）
          </button>
        </div>
      </article>

      <article className="apple-panel p-6">
        <h2 className="h-display text-2xl font-semibold">充值对接配置</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          可切换本地模式或外部 API 模式。外部模式会走 VIP 查询和充值接口链路。
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm text-[var(--text-muted)]" htmlFor="channel-list">
              渠道列表（每行一个）
            </label>
            <textarea
              id="channel-list"
              className="field min-h-[120px] py-2"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
            />
            <button className="btn-pill w-fit" type="button" onClick={() => void saveChannels()}>
              保存渠道
            </button>
          </div>

          <div className="grid gap-3">
            <label className="text-sm text-[var(--text-muted)]" htmlFor="channel-select">
              当前渠道
            </label>
            <select
              id="channel-select"
              className="field"
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
            >
              {channels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={useExternalApi}
                onChange={(e) => setUseExternalApi(e.target.checked)}
              />
              使用外部充值 API 模式
            </label>

            <input
              className="field"
              placeholder="外部 Access-Token（外部模式必填）"
              value={externalAccessToken}
              onChange={(e) => setExternalAccessToken(e.target.value)}
            />
            <input
              className="field"
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
                    <span className="status-pill">{item.status}</span>
                  </td>
                  <td>{new Date(item.updatedAt).toLocaleString()}</td>
                  <td className="flex gap-2">
                    <button className="btn-pill" onClick={() => void copyCdkLink(item.token)} type="button">
                      复制CDK链接
                    </button>
                    <button
                      className="btn-pill"
                      onClick={() => void copyRechargeLink(item.rechargeLink)}
                      type="button"
                    >
                      复制充值链接
                    </button>
                    <button className="btn-pill" onClick={() => openQr(item.qrPayload)} type="button">
                      查看二维码
                    </button>
                    <button className="btn-pill" onClick={() => void generateLink(item.id)} type="button">
                      生成充值链接
                    </button>
                    <button className="btn-primary" onClick={() => void completeTask(item.id)} type="button">
                      标记完成
                    </button>
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
                  <td>{item.status}</td>
                  <td>{new Date(item.expiresAt).toLocaleString()}</td>
                  <td>
                    <button
                      className="btn-pill"
                      onClick={() => void copyCdkLink(item.token)}
                      type="button"
                    >
                      复制完整链接
                    </button>
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
