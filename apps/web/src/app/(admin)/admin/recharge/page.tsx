"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getAdminToken } from "@/lib/admin-auth";

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
      setMessage(error instanceof Error ? error.message : "Load failed");
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
      setMessage(error instanceof Error ? error.message : "Generate failed");
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
      setMessage(error instanceof Error ? error.message : "Update failed");
    }
  }

  return (
    <section className="grid gap-6">
      <header className="flex items-center justify-between">
        <h1 className="h-display text-4xl font-semibold">Recharge Workbench</h1>
      </header>

      <article className="apple-panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Actions</th>
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
                    Generate Link/QR
                  </button>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() => void markCompleted(item.id)}
                  >
                    Mark Completed
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      {generated ? (
        <section className="apple-panel p-6 text-sm">
          <p>Status: {generated.status}</p>
          <p className="break-all">Link: {generated.rechargeLink}</p>
          {generated.qrPayload ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Recharge QR" className="mt-3 h-40 w-40" src={generated.qrPayload} />
          ) : null}
        </section>
      ) : null}

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </section>
  );
}



