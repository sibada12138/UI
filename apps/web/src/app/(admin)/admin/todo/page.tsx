"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { adminApiRequest } from "@/lib/admin-api";
import { toErrorMessage } from "@/lib/error-message";

type TodoTask = {
  id: string;
  phoneMasked: string;
  token: string;
  status: string;
  updatedAt: string;
};

type CdkItem = {
  id: string;
  token: string;
  status: string;
  expiresAt: string;
};

export default function TodoPage() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [cdks, setCdks] = useState<CdkItem[]>([]);
  const [message, setMessage] = useState("");

  const pendingTasks = useMemo(
    () => tasks.filter((item) => item.status === "pending"),
    [tasks],
  );

  async function load() {
    try {
      const [taskData, cdkData] = await Promise.all([
        adminApiRequest<{ items: TodoTask[] }>("/admin/recharge/tasks"),
        adminApiRequest<{ items: CdkItem[] }>("/admin/tokens"),
      ]);
      setTasks(taskData.items);
      setCdks(cdkData.items);
    } catch (error) {
      setMessage(toErrorMessage(error, "加载待办数据失败"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createCdk() {
    setMessage("");
    try {
      await adminApiRequest("/admin/tokens", {
        method: "POST",
        body: { expiresInMinutes: 30 },
      });
      await load();
    } catch (error) {
      setMessage(toErrorMessage(error, "新增 CDK 失败"));
    }
  }

  async function generateLink(taskId: string) {
    setMessage("");
    try {
      await adminApiRequest(`/admin/recharge/tasks/${taskId}/generate-link`, {
        method: "POST",
      });
      await load();
    } catch (error) {
      setMessage(toErrorMessage(error, "生成开号链接失败"));
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

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">等待开号列表</h2>
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>手机号</th>
                <th>CDK</th>
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
                  <td>
                    <span className="status-pill">{item.status}</span>
                  </td>
                  <td>{new Date(item.updatedAt).toLocaleString()}</td>
                  <td className="flex gap-2">
                    <button className="btn-pill" onClick={() => void generateLink(item.id)} type="button">
                      生成开号链接
                    </button>
                    <button className="btn-primary" onClick={() => void completeTask(item.id)} type="button">
                      标记完成
                    </button>
                  </td>
                </tr>
              ))}
              {pendingTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-[var(--text-muted)]">
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
                  <td>{item.status}</td>
                  <td>{new Date(item.expiresAt).toLocaleString()}</td>
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
