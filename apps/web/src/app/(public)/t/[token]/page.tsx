"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";

type TokenStatusResponse = {
  status: string;
  expiresAt: string;
  consumedAt?: string | null;
};

export default function TokenPage() {
  const params = useParams<{ token: string }>();
  const token = useMemo(() => String(params.token ?? ""), [params.token]);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [status, setStatus] = useState<TokenStatusResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadStatus() {
    if (!token) return;
    try {
      const data = await apiRequest<TokenStatusResponse>(
        `/public/token/${token}/status`,
      );
      setStatus(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Load failed");
    }
  }

  useEffect(() => {
    void loadStatus();
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const result = await apiRequest<{
        success: boolean;
        phoneMasked: string;
        status: string;
      }>(`/public/token/${token}/submit`, {
        method: "POST",
        body: { phone, smsCode },
      });
      setMessage(
        `Submit success: ${result.phoneMasked}, token status: ${result.status}`,
      );
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-dark)] px-6 py-16 text-[var(--text-light)] md:px-10">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <h1 className="h-display text-4xl font-semibold leading-tight md:text-5xl">
          Token Activation
        </h1>
        <p className="text-white/70">
          token: <span className="font-mono text-sm">{token}</span>
        </p>

        {status && (
          <div className="rounded-[12px] border border-white/15 p-4 text-sm text-white/80">
            <p>Status: {status.status}</p>
            <p>Expires: {new Date(status.expiresAt).toLocaleString()}</p>
            {status.consumedAt ? (
              <p>Consumed: {new Date(status.consumedAt).toLocaleString()}</p>
            ) : null}
          </div>
        )}

        <section className="rounded-[12px] bg-[var(--surface-soft-dark)] p-6">
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="text-sm text-white/80" htmlFor="phone">
              Phone
            </label>
            <input
              id="phone"
              className="field bg-white text-[var(--text-dark)]"
              placeholder="Enter phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <label className="text-sm text-white/80" htmlFor="smsCode">
              SMS Code
            </label>
            <input
              id="smsCode"
              className="field bg-white text-[var(--text-dark)]"
              placeholder="Enter sms code"
              type="text"
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value)}
            />
            <button className="btn-primary mt-3 w-full" type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit"}
            </button>
          </form>
        </section>

        {message ? (
          <p className="rounded-[8px] bg-white/10 px-4 py-3 text-sm">{message}</p>
        ) : null}
      </div>
    </main>
  );
}



