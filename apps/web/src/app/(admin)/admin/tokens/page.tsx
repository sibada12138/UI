"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getAdminToken } from "@/lib/admin-auth";

type TokenItem = {
  id: string;
  token: string;
  status: string;
  expiresAt: string;
};

export default function TokensPage() {
  const [items, setItems] = useState<TokenItem[]>([]);
  const [message, setMessage] = useState("");
  const token = getAdminToken();

  async function load() {
    try {
      const data = await apiRequest<{ items: TokenItem[] }>("/admin/tokens", { token });
      setItems(data.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createToken() {
    setMessage("");
    try {
      await apiRequest("/admin/tokens", {
        method: "POST",
        token,
        body: { expiresInMinutes: 30 },
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create failed");
    }
  }

  async function revokeToken(id: string) {
    setMessage("");
    try {
      await apiRequest(`/admin/tokens/${id}/revoke`, {
        method: "POST",
        token,
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revoke failed");
    }
  }

  return (
    <section className="grid gap-6">
      <header className="flex items-center justify-between">
        <h1 className="h-display text-4xl font-semibold">Token Management</h1>
        <button className="btn-primary" type="button" onClick={() => void createToken()}>
          Create 30m Token
        </button>
      </header>

      <article className="apple-panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-black/5">
                <td className="px-4 py-3 font-mono">{item.token}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3">{new Date(item.expiresAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button
                    className="btn-pill mr-3"
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${window.location.origin}/t/${item.token}`,
                      )
                    }
                  >
                    Copy Link
                  </button>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() => void revokeToken(item.id)}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </section>
  );
}



