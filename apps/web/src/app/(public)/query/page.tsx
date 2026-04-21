"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type CaptchaResponse = {
  captchaId: string;
  captchaSvg: string;
  expiresInSec: number;
};

type QueryResponse = {
  phoneMasked: string;
  token: string;
  tokenStatus: string;
  rechargeStatus: string;
  updatedAt: string | null;
};

export default function QueryPage() {
  const [queryType, setQueryType] = useState<"token" | "phone">("token");
  const [queryValue, setQueryValue] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadCaptcha() {
    try {
      const data = await apiRequest<CaptchaResponse>("/public/captcha/create", {
        method: "POST",
      });
      setCaptchaId(data.captchaId);
      setCaptchaSvg(data.captchaSvg);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Captcha load failed");
    }
  }

  useEffect(() => {
    void loadCaptcha();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setResult(null);
    try {
      const data = await apiRequest<QueryResponse>("/public/query", {
        method: "POST",
        body: {
          queryType,
          queryValue,
          captchaId,
          captchaCode,
        },
      });
      setResult(data);
      setMessage("Query success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Query failed");
    } finally {
      setCaptchaCode("");
      await loadCaptcha();
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-light)] px-6 py-16 md:px-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <h1 className="h-display text-5xl font-semibold leading-[1.07] text-[var(--text-dark)]">
          Check Activation Progress
        </h1>
        <section className="apple-panel p-6">
          <form className="grid gap-4" onSubmit={onSubmit}>
            <label className="text-sm text-[var(--text-muted)]" htmlFor="queryType">
              Query Type
            </label>
            <select
              className="field"
              id="queryType"
              value={queryType}
              onChange={(e) => setQueryType(e.target.value as "token" | "phone")}
            >
              <option value="token">Token</option>
              <option value="phone">Phone</option>
            </select>

            <label className="text-sm text-[var(--text-muted)]" htmlFor="queryValue">
              Value
            </label>
            <input
              id="queryValue"
              className="field"
              placeholder="Enter token or phone"
              type="text"
              value={queryValue}
              onChange={(e) => setQueryValue(e.target.value)}
            />

            <label className="text-sm text-[var(--text-muted)]" htmlFor="captcha">
              Captcha
            </label>
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <input
                id="captcha"
                className="field"
                placeholder="Enter captcha"
                type="text"
                value={captchaCode}
                onChange={(e) => setCaptchaCode(e.target.value)}
              />
              <button
                type="button"
                className="field flex items-center justify-center bg-white p-0"
                onClick={() => void loadCaptcha()}
                title="Refresh captcha"
              >
                {captchaSvg ? (
                  <span
                    className="block h-full w-full"
                    dangerouslySetInnerHTML={{ __html: captchaSvg }}
                  />
                ) : (
                  "Loading..."
                )}
              </button>
            </div>

            <button className="btn-primary mt-3 w-fit px-8" type="submit" disabled={loading}>
              {loading ? "Querying..." : "Query"}
            </button>
          </form>
        </section>

        {message ? <p className="text-sm text-[var(--text-muted)]">{message}</p> : null}
        {result ? (
          <section className="apple-panel p-6 text-sm">
            <p>Phone: {result.phoneMasked || "-"}</p>
            <p>Token: {result.token}</p>
            <p>Token Status: {result.tokenStatus}</p>
            <p>Recharge Status: {result.rechargeStatus}</p>
            <p>
              Updated At: {result.updatedAt ? new Date(result.updatedAt).toLocaleString() : "-"}
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}



