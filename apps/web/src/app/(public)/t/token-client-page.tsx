"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { toErrorMessage } from "@/lib/error-message";

type CdkStatusResponse = {
  status: string;
  expiresAt: string;
  consumedAt?: string | null;
};

type CaptchaResponse = {
  captchaId: string;
  captchaSvg: string;
};

type QueryResponse = {
  phoneMasked: string;
  token: string;
  tokenStatus: string;
  rechargeStatus: string;
  updatedAt: string | null;
};

type Props = {
  initialToken?: string;
};

function isCdkValid(value: string) {
  return /^tk_[a-zA-Z0-9_-]{8,}$/.test(value.trim());
}

function statusLabel(status?: string) {
  if (status === "active") return "可使用";
  if (status === "consumed") return "已提交";
  if (status === "expired") return "已过期";
  if (status === "revoked") return "已封禁";
  return status || "-";
}

export default function TokenClientPage({ initialToken = "" }: Props) {
  const [panel, setPanel] = useState<"submit" | "query">("submit");
  const [cdk, setCdk] = useState(initialToken);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<CdkStatusResponse | null>(null);

  const [queryType, setQueryType] = useState<"token" | "phone">("token");
  const [queryValue, setQueryValue] = useState(initialToken);
  const [captchaId, setCaptchaId] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [queryMessage, setQueryMessage] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);

  const cdkValid = useMemo(() => isCdkValid(cdk), [cdk]);
  const currentStep = useMemo(() => {
    if (panel === "query") {
      return 3;
    }
    if (smsCode.trim()) {
      return 2;
    }
    return 1;
  }, [panel, smsCode]);

  async function loadCdkStatus(nextValue: string) {
    const value = nextValue.trim();
    if (!isCdkValid(value)) {
      setStatus(null);
      return;
    }
    try {
      const data = await apiRequest<CdkStatusResponse>(
        `/public/token/${encodeURIComponent(value)}/status`,
      );
      setStatus(data);
    } catch (error) {
      setStatus(null);
      setMessage(toErrorMessage(error, "读取 CDK 状态失败"));
    }
  }

  async function loadCaptcha() {
    try {
      const data = await apiRequest<CaptchaResponse>("/public/captcha/create", {
        method: "POST",
      });
      setCaptchaId(data.captchaId);
      setCaptchaSvg(data.captchaSvg);
    } catch (error) {
      setQueryMessage(toErrorMessage(error, "验证码加载失败"));
    }
  }

  useEffect(() => {
    void loadCaptcha();
  }, []);

  useEffect(() => {
    if (smsCountdown <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setSmsCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsCountdown]);

  useEffect(() => {
    if (initialToken) {
      setCdk(initialToken);
      setQueryValue(initialToken);
      void loadCdkStatus(initialToken);
    }
  }, [initialToken]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!cdk.trim()) {
      setMessage("请先填写 CDK");
      return;
    }
    if (!cdkValid) {
      setMessage("CDK 格式不正确，无法提交");
      return;
    }

    setSubmitLoading(true);
    try {
      const result = await apiRequest<{
        success: boolean;
        phoneMasked: string;
        status: string;
      }>("/public/token/submit", {
        method: "POST",
        body: { token: cdk.trim(), phone, smsCode },
      });
      setMessage(`提交成功：${result.phoneMasked}，状态：${statusLabel(result.status)}`);
      await loadCdkStatus(cdk.trim());
    } catch (error) {
      setMessage(toErrorMessage(error, "提交失败"));
    } finally {
      setSubmitLoading(false);
    }
  }

  async function sendSmsCode() {
    setMessage("");
    const phoneValue = phone.trim();
    if (!cdkValid) {
      setMessage("请先填写有效 CDK 后再发送验证码。");
      return;
    }
    if (!/^1\d{10}$/.test(phoneValue)) {
      setMessage("请先填写正确手机号。");
      return;
    }

    setSmsLoading(true);
    try {
      const data = await apiRequest<{ success: boolean; retryAfterSec?: number; message?: string }>(
        "/public/token/send-sms",
        {
          method: "POST",
          body: { token: cdk.trim(), phone: phoneValue },
        },
      );
      const waitSec = Math.max(1, Number(data.retryAfterSec ?? 60));
      setSmsCountdown(waitSec);
      setMessage(data.success ? "短信验证码已发送，请注意查收。" : "发送过于频繁，请稍后再试。");
    } catch (error) {
      setMessage(toErrorMessage(error, "短信发送失败"));
    } finally {
      setSmsLoading(false);
    }
  }

  async function onQuery(event: FormEvent) {
    event.preventDefault();
    setQueryLoading(true);
    setQueryMessage("");
    setQueryResult(null);
    try {
      const data = await apiRequest<QueryResponse>("/public/query", {
        method: "POST",
        body: {
          queryType,
          queryValue: queryValue.trim(),
          captchaId,
          captchaCode,
        },
      });
      setQueryResult(data);
      setQueryMessage("查询成功");
    } catch (error) {
      setQueryMessage(toErrorMessage(error, "查询失败"));
    } finally {
      setCaptchaCode("");
      await loadCaptcha();
      setQueryLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(140deg,#eef2f8_0%,#f2f0eb_45%,#e8f2ee_100%)] px-4 py-8 text-[var(--page-text)] md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-[18px] border border-white/35 bg-white shadow-[0_20px_55px_rgba(30,57,50,0.12)]">
          <div className="bg-[linear-gradient(120deg,#1e3932_0%,#00754a_45%,#3f8f7a_100%)] p-6 text-white md:p-8">
            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs tracking-[0.08em] text-white/85">
              CDK 用户中心
            </p>
            <h1 className="h-display mt-4 text-3xl font-semibold leading-[1.15] md:text-5xl">
              账号登录与开卡进度
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/85 md:text-base">
              URL 中带的 CDK 会自动填入。按步骤提交账号信息后，可在查询页实时查看开卡状态。
            </p>
          </div>
          <div className="bg-white p-6 md:p-8">
            <div className="flex items-center justify-between gap-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                      currentStep >= step
                        ? "border-[var(--brand-green-accent)] bg-[var(--brand-green-accent)] text-white"
                        : "border-[var(--card-border)] bg-white text-[var(--text-muted)]"
                    }`}
                  >
                    {step}
                  </div>
                  {step !== 3 ? (
                    <div
                      className={`h-[2px] flex-1 ${
                        currentStep > step ? "bg-[var(--brand-green-accent)]" : "bg-[var(--card-border)]"
                      }`}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 text-center text-xs text-[var(--text-muted)]">
              <span>验证 CDK</span>
              <span>提交账号</span>
              <span>查询进度</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-[14px] border border-[var(--card-border)] bg-white p-4 shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--text-muted)]">
            CDK 用户中心
            <span className="ml-2 font-medium text-[var(--page-text)]">
              {panel === "submit" ? "请先完成登录提交" : "请在此查询开卡状态"}
            </span>
          </p>
        </div>
      </div>

      <div className="mx-auto mt-6 flex max-w-5xl rounded-full border border-[var(--card-border)] bg-white p-1">
        <button
          type="button"
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            panel === "submit" ? "bg-[var(--brand-green-accent)] text-white" : "text-[var(--text-muted)]"
          }`}
          onClick={() => setPanel("submit")}
        >
          登录提交
        </button>
        <button
          type="button"
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            panel === "query" ? "bg-[var(--brand-green-accent)] text-white" : "text-[var(--text-muted)]"
          }`}
          onClick={() => setPanel("query")}
        >
          进度查询
        </button>
      </div>

      <div className="mx-auto mt-6 max-w-5xl">
        {panel === "submit" ? (
          <section className="apple-panel p-6 md:p-8">
            <h2 className="h-display text-2xl font-semibold">CDK 登录提交</h2>
            <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
              <label className="text-sm text-[var(--text-muted)]" htmlFor="cdk">
                CDK
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <input
                  id="cdk"
                  className="field font-mono"
                  placeholder="请输入 CDK"
                  value={cdk}
                  onChange={(e) => setCdk(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-pill"
                  onClick={() => void loadCdkStatus(cdk)}
                  disabled={!cdkValid}
                >
                  校验状态
                </button>
              </div>

              {status ? (
                <div className="rounded-[10px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
                  <p>CDK 状态：{statusLabel(status.status)}</p>
                  <p>过期时间：{new Date(status.expiresAt).toLocaleString()}</p>
                  {status.consumedAt ? (
                    <p>提交时间：{new Date(status.consumedAt).toLocaleString()}</p>
                  ) : null}
                </div>
              ) : null}

              <label className="text-sm text-[var(--text-muted)]" htmlFor="phone">
                手机号
              </label>
              <input
                id="phone"
                className="field"
                placeholder="请输入手机号"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <label className="text-sm text-[var(--text-muted)]" htmlFor="smsCode">
                短信验证码
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <input
                  id="smsCode"
                  className="field"
                  placeholder="请输入短信验证码"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-pill"
                  onClick={() => void sendSmsCode()}
                  disabled={smsLoading || smsCountdown > 0}
                >
                  {smsLoading ? "发送中..." : smsCountdown > 0 ? `${smsCountdown}s` : "发送短信"}
                </button>
              </div>

              <button
                className="btn-primary mt-2 w-full"
                type="submit"
                disabled={submitLoading || !cdkValid}
              >
                {submitLoading ? "提交中..." : "提交登录信息"}
              </button>
            </form>
            {message ? <p className="mt-4 text-sm text-[var(--danger)]">{message}</p> : null}
          </section>
        ) : null}

        {panel === "query" ? (
          <section className="apple-panel p-6 md:p-8">
            <h2 className="h-display text-2xl font-semibold">开卡进度查询</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              支持 CDK 或手机号查询。单 IP 连续失败 5 次将限制 1 小时。
            </p>
            <form className="mt-5 grid gap-4" onSubmit={onQuery}>
              <label className="text-sm text-[var(--text-muted)]" htmlFor="queryType">
                查询方式
              </label>
              <select
                id="queryType"
                className="field"
                value={queryType}
                onChange={(e) => setQueryType(e.target.value as "token" | "phone")}
              >
                <option value="token">按 CDK 查询</option>
                <option value="phone">按手机号查询</option>
              </select>

              <label className="text-sm text-[var(--text-muted)]" htmlFor="queryValue">
                查询值
              </label>
              <input
                id="queryValue"
                className="field"
                placeholder={queryType === "token" ? "请输入 CDK" : "请输入手机号"}
                value={queryValue}
                onChange={(e) => setQueryValue(e.target.value)}
              />

              <label className="text-sm text-[var(--text-muted)]" htmlFor="captchaCode">
                字母验证码
              </label>
              <div className="grid grid-cols-[1fr_140px] gap-3">
                <input
                  id="captchaCode"
                  className="field"
                  placeholder="输入验证码"
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                />
                <button
                  type="button"
                  className="field flex items-center justify-center bg-white p-0 text-black"
                  onClick={() => void loadCaptcha()}
                >
                  {captchaSvg ? (
                    <span
                      className="block h-full w-full"
                      dangerouslySetInnerHTML={{ __html: captchaSvg }}
                    />
                  ) : (
                    "加载中..."
                  )}
                </button>
              </div>

              <button className="btn-primary mt-2 w-full" type="submit" disabled={queryLoading}>
                {queryLoading ? "查询中..." : "查询进度"}
              </button>
            </form>

            {queryMessage ? <p className="mt-4 text-sm text-[var(--danger)]">{queryMessage}</p> : null}
            {queryResult ? (
              <div className="mt-4 rounded-[10px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-4 text-sm text-[var(--text-muted)]">
                <p>手机号：{queryResult.phoneMasked || "-"}</p>
                <p>CDK：{queryResult.token}</p>
                <p>CDK 状态：{statusLabel(queryResult.tokenStatus)}</p>
                <p>充值状态：{queryResult.rechargeStatus}</p>
                <p>
                  最近更新：
                  {queryResult.updatedAt ? new Date(queryResult.updatedAt).toLocaleString() : "-"}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
