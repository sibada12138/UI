"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getAdminToken } from "@/lib/admin-auth";
import { toErrorMessage } from "@/lib/error-message";

type TaskItem = {
  id: string;
  phoneMasked: string;
  token: string;
  status: string;
  updatedAt: string;
};

type LinkResult = {
  rechargeLink: string;
  qrPayload: string;
  status: string;
};

export default function RechargePage() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [message, setMessage] = useState("");
  const [generated, setGenerated] = useState<LinkResult | null>(null);
  const token = getAdminToken();

  async function load() {
    try {
      const data = await apiRequest<{ items: TaskItem[] }>("/admin/recharge/tasks", { token });
      setItems(data.items);
    } catch (error) {
      setMessage(toErrorMessage(error, "加载工单失败"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function generateLink(taskId: string) {
    setMessage("");
    try {
      const result = await apiRequest<LinkResult>(`/admin/recharge/tasks/${taskId}/generate-link`, {
        method: "POST",
        token,
      });
      setGenerated(result);
      await load();
    } catch (error) {
      setMessage(toErrorMessage(error, "生成充值链接失败"));
    }
  }

  async function markCompleted(taskId: string) {
    setMessage("");
    try {
      await apiRequest(`/admin/recharge/tasks/${taskId}/status`, {
        method: "POST",
        token,
        body: { status: "completed", remark: "done by operator" },
      });
      await load();
    } catch (error) {
      setMessage(toErrorMessage(error, "更新工单状态失败"));
    }
  }

  return (
    <section className="grid gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="h-display text-4xl font-semibold">充值处理台</h1>
          <p className="mt-2 text-sm text-[var(--text-subtle)]">
            用户提交短信登录后，客服在此生成充值链接二维码，线下处理完成后回填状态。
          </p>
        </div>
      </header>

      <article className="apple-panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-4 py-3">手机号</th>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">更新时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-black/5">
                <td className="px-4 py-3">{item.phoneMasked}</td>
                <td className="px-4 py-3 font-mono">{item.token}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3">{new Date(item.updatedAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button
                    className="btn-primary mr-2"
                    type="button"
                    onClick={() => void generateLink(item.id)}
                  >
                    生成充值链接/二维码
                  </button>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() => void markCompleted(item.id)}
                  >
                    标记已完成
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      {generated ? (
        <section className="apple-panel p-6 text-sm">
          <p>状态：{generated.status}</p>
          <p className="break-all">链接：{generated.rechargeLink}</p>
          {generated.qrPayload ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="充值二维码" className="mt-3 h-40 w-40" src={generated.qrPayload} />
          ) : null}
        </section>
      ) : null}

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </section>
  );
}



