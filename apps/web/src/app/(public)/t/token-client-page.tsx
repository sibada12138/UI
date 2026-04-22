"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { apiRequest } from "@/lib/api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type CdkStatusResponse = {
  status: string;
  expiresAt: string;
  consumedAt?: string | null;
};

type QueryCaptchaResponse = {
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

type SmsBootstrapResponse = {
  smsSessionId: string;
  phoneCc: string;
  captchaImageDataUrl: string;
  expiresInSec: number;
};

type QrCreateResponse = {
  qrSessionId: string;
  qrCode: string;
  qrImageDataUrl: string;
  expiresInSec: number;
};

type QrStatusResponse = {
  verified: boolean;
  raw: unknown;
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

function rechargeStatusLabel(status?: string) {
  if (status === "pending") return "待充值";
  if (status === "link_generated") return "已生成链接";
  if (status === "processing") return "处理中";
  if (status === "completed") return "已开";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  return status || "-";
}

export default function TokenClientPage({ initialToken = "" }: Props) {
  const [loginMode, setLoginMode] = useState<"sms" | "qr">("sms");
  const [cdk, setCdk] = useState(initialToken);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<CdkStatusResponse | null>(null);

  const [smsSessionId, setSmsSessionId] = useState("");
  const [smsCaptchaImage, setSmsCaptchaImage] = useState("");
  const [smsCaptchaCode, setSmsCaptchaCode] = useState("");
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);

  const [qrSessionId, setQrSessionId] = useState("");
  const [qrImageData, setQrImageData] = useState("");
  const [qrVerified, setQrVerified] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrStatusText, setQrStatusText] = useState("未开始");

  const [submitLoading, setSubmitLoading] = useState(false);

  const [queryVisible, setQueryVisible] = useState(false);
  const [queryType, setQueryType] = useState<"token" | "phone">("token");
  const [queryValue, setQueryValue] = useState(initialToken);
  const [queryCaptchaId, setQueryCaptchaId] = useState("");
  const [queryCaptchaSvg, setQueryCaptchaSvg] = useState("");
  const [queryCaptchaCode, setQueryCaptchaCode] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryMessage, setQueryMessage] = useState("");

  const cdkValid = useMemo(() => isCdkValid(cdk), [cdk]);

  const currentStep = useMemo(() => {
    if (loginMode === "qr" && qrVerified) {
      return 2;
    }
    if (loginMode === "sms" && smsCode.trim()) {
      return 2;
    }
    return 1;
  }, [loginMode, qrVerified, smsCode]);

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
      const text = toErrorMessage(error, "CDK 状态读取失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    }
  }

  async function loadQueryCaptcha() {
    try {
      const data = await apiRequest<QueryCaptchaResponse>("/public/captcha/create", {
        method: "POST",
      });
      setQueryCaptchaId(data.captchaId);
      setQueryCaptchaSvg(data.captchaSvg);
    } catch (error) {
      setQueryMessage(toErrorMessage(error, "验证码加载失败"));
    }
  }

  useEffect(() => {
    void loadQueryCaptcha();
  }, []);

  useEffect(() => {
    if (initialToken) {
      setCdk(initialToken);
      setQueryValue(initialToken);
      void loadCdkStatus(initialToken);
    }
  }, [initialToken]);

  useEffect(() => {
    if (smsCountdown <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setSmsCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsCountdown]);

  async function refreshSmsCaptcha() {
    if (!cdkValid) {
      setMessage("请先输入有效 CDK。");
      return;
    }
    setMessage("");
    setSmsLoading(true);
    try {
      const data = await apiRequest<SmsBootstrapResponse>("/public/token/sms/bootstrap", {
        method: "POST",
        body: { token: cdk.trim() },
      });
      setSmsSessionId(data.smsSessionId);
      setSmsCaptchaImage(data.captchaImageDataUrl);
      setSmsCaptchaCode("");
      pushToast({ type: "success", message: "图形验证码已刷新。" });
    } catch (error) {
      const text = toErrorMessage(error, "图形验证码加载失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setSmsLoading(false);
    }
  }

  async function sendSmsCode() {
    const phoneValue = phone.trim();
    if (!cdkValid) {
      setMessage("请先输入有效 CDK。");
      return;
    }
    if (!/^1\d{10}$/.test(phoneValue)) {
      setMessage("请输入正确手机号。");
      return;
    }
    if (!smsSessionId || !smsCaptchaImage) {
      setMessage("请先获取图形验证码。");
      return;
    }
    if (!smsCaptchaCode.trim()) {
      setMessage("请输入图形验证码。");
      return;
    }

    setMessage("");
    setSmsLoading(true);
    try {
      const data = await apiRequest<{ success: boolean; retryAfterSec?: number }>(
        "/public/token/send-sms",
        {
          method: "POST",
          body: {
            token: cdk.trim(),
            phone: phoneValue,
            captcha: smsCaptchaCode.trim(),
            smsSessionId,
          },
        },
      );
      if (data.success) {
        setSmsCountdown(Math.max(1, Number(data.retryAfterSec ?? 60)));
        pushToast({ type: "success", message: "短信已发送，请注意查收。" });
      } else {
        setSmsCountdown(Math.max(1, Number(data.retryAfterSec ?? 60)));
        pushToast({ type: "info", message: "发送过于频繁，请稍后再试。" });
      }
    } catch (error) {
      const text = toErrorMessage(error, "短信发送失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
      await refreshSmsCaptcha();
    } finally {
      setSmsLoading(false);
    }
  }

  async function createQr() {
    if (!cdkValid) {
      setMessage("请先输入有效 CDK。");
      return;
    }
    setMessage("");
    setQrLoading(true);
    try {
      const data = await apiRequest<QrCreateResponse>("/public/token/qr/create", {
        method: "POST",
        body: { token: cdk.trim() },
      });
      setQrSessionId(data.qrSessionId);
      setQrImageData(data.qrImageDataUrl);
      setQrVerified(false);
      setQrStatusText("二维码已生成，请使用客户端扫码。");
      pushToast({ type: "success", message: "二维码已生成。" });
    } catch (error) {
      const text = toErrorMessage(error, "二维码生成失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setQrLoading(false);
    }
  }

  async function refreshQrStatus() {
    if (!qrSessionId) {
      setMessage("请先生成二维码。");
      return;
    }
    setQrLoading(true);
    try {
      const data = await apiRequest<QrStatusResponse>(
        `/public/token/qr/${encodeURIComponent(qrSessionId)}/status`,
      );
      setQrVerified(Boolean(data.verified));
      setQrStatusText(data.verified ? "已完成扫码授权。" : "等待扫码确认中。");
    } catch (error) {
      const text = toErrorMessage(error, "扫码状态读取失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setQrLoading(false);
    }
  }

  async function confirmQrLogin() {
    if (!cdkValid) {
      setMessage("请先输入有效 CDK。");
      return;
    }
    if (!qrSessionId) {
      setMessage("请先生成二维码。");
      return;
    }

    setQrLoading(true);
    try {
      await apiRequest<{ success: boolean }>("/public/token/qr/login", {
        method: "POST",
        body: {
          token: cdk.trim(),
          qrSessionId,
        },
      });
      setQrVerified(true);
      setQrStatusText("扫码登录校验通过。");
      pushToast({ type: "success", message: "扫码登录成功，可提交。 " });
    } catch (error) {
      const text = toErrorMessage(error, "扫码登录失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setQrLoading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!cdk.trim()) {
      setMessage("请先填写 CDK。");
      return;
    }
    if (!cdkValid) {
      setMessage("CDK 格式不正确。");
      return;
    }

    const body =
      loginMode === "qr"
        ? {
            token: cdk.trim(),
            phone,
            loginMode: "qr",
            qrSessionId,
          }
        : {
            token: cdk.trim(),
            phone,
            smsCode,
            loginMode: "sms",
            smsSessionId,
          };

    setSubmitLoading(true);
    try {
      const result = await apiRequest<{
        success: boolean;
        phoneMasked: string;
        status: string;
      }>("/public/token/submit", {
        method: "POST",
        body,
      });
      const successText = `提交成功：${result.phoneMasked}，状态：${statusLabel(result.status)}`;
      setMessage(successText);
      pushToast({ type: "success", message: "登录信息提交成功。" });
      await loadCdkStatus(cdk.trim());
    } catch (error) {
      const text = toErrorMessage(error, "提交失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setSubmitLoading(false);
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
          captchaId: queryCaptchaId,
          captchaCode: queryCaptchaCode,
        },
      });
      setQueryResult(data);
      setQueryMessage("查询成功");
    } catch (error) {
      setQueryMessage(toErrorMessage(error, "查询失败"));
    } finally {
      setQueryCaptchaCode("");
      await loadQueryCaptcha();
      setQueryLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(160deg,#f7f8fb_0%,#f1f3f8_30%,#eef2f6_70%,#ffffff_100%)] px-4 py-8 text-[var(--page-text)] md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-[18px] border border-[var(--card-border)] bg-white shadow-[0_20px_55px_rgba(10,24,40,0.08)]">
          <div className="bg-[linear-gradient(120deg,#1e2c3a_0%,#2f4f68_45%,#4a6f8e_100%)] p-6 text-white md:p-8">
            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs tracking-[0.08em] text-white/90">
              CDK 用户中心
            </p>
            <h1 className="h-display mt-4 text-3xl font-semibold leading-[1.15] md:text-5xl">
              登录提交与开卡查询
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/85 md:text-base">
              通过 CDK 完成登录信息提交，客服处理后可在下方查询最新进度。
            </p>
          </div>

          <div className="bg-white p-6 md:p-8">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { step: 1, label: "验证 CDK" },
                { step: 2, label: "登录校验" },
                { step: 3, label: "完成提交" },
              ].map((item) => (
                <div key={item.step} className="grid justify-items-center gap-2">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                      currentStep >= item.step
                        ? "border-[var(--brand-green-accent)] bg-[var(--brand-green-accent)] text-white"
                        : "border-[var(--card-border)] bg-white text-[var(--text-muted)]"
                    }`}
                  >
                    {item.step}
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-5xl">
        <section className="apple-panel p-6 md:p-8">
          <h2 className="h-display text-2xl font-semibold">登录提交</h2>
          <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
            <label className="text-sm text-[var(--text-muted)]" htmlFor="cdk">
              CDK
            </label>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
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
                {status.consumedAt ? <p>提交时间：{new Date(status.consumedAt).toLocaleString()}</p> : null}
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

            <div className="mt-1 flex rounded-full border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-1">
              <button
                type="button"
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${
                  loginMode === "sms" ? "bg-white text-[var(--page-text)] shadow-sm" : "text-[var(--text-muted)]"
                }`}
                onClick={() => setLoginMode("sms")}
              >
                短信登录
              </button>
              <button
                type="button"
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${
                  loginMode === "qr" ? "bg-white text-[var(--page-text)] shadow-sm" : "text-[var(--text-muted)]"
                }`}
                onClick={() => setLoginMode("qr")}
              >
                扫码登录
              </button>
            </div>

            {loginMode === "sms" ? (
              <div className="grid gap-3 rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    className="field"
                    placeholder="输入图形验证码"
                    value={smsCaptchaCode}
                    onChange={(e) => setSmsCaptchaCode(e.target.value)}
                  />
                  <button className="btn-pill" type="button" onClick={() => void refreshSmsCaptcha()} disabled={smsLoading}>
                    {smsLoading ? "加载中..." : "获取图形验证码"}
                  </button>
                </div>
                {smsCaptchaImage ? (
                  <div className="rounded-[10px] border border-[var(--card-border)] bg-white p-2">
                    <Image
                      src={smsCaptchaImage}
                      alt="图形验证码"
                      width={320}
                      height={64}
                      unoptimized
                      className="h-16 w-full object-contain"
                    />
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    className="field"
                    placeholder="请输入短信验证码"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                  />
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() => void sendSmsCode()}
                    disabled={smsLoading || smsCountdown > 0}
                  >
                    {smsLoading ? "发送中..." : smsCountdown > 0 ? `${smsCountdown}s` : "发送短信"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-4">
                <div className="flex flex-wrap gap-2">
                  <button className="btn-pill" type="button" onClick={() => void createQr()} disabled={qrLoading}>
                    {qrLoading ? "生成中..." : "生成扫码二维码"}
                  </button>
                  <button className="btn-pill" type="button" onClick={() => void refreshQrStatus()} disabled={qrLoading || !qrSessionId}>
                    刷新状态
                  </button>
                  <button className="btn-primary" type="button" onClick={() => void confirmQrLogin()} disabled={qrLoading || !qrSessionId}>
                    确认扫码登录
                  </button>
                </div>
                {qrImageData ? (
                  <div className="rounded-[10px] border border-[var(--card-border)] bg-white p-3">
                    <Image
                      src={qrImageData}
                      alt="扫码二维码"
                      width={160}
                      height={160}
                      unoptimized
                      className="mx-auto h-40 w-40 object-contain"
                    />
                  </div>
                ) : null}
                <p className="text-sm text-[var(--text-muted)]">
                  {qrStatusText}
                  {qrVerified ? <span className="ml-2 text-emerald-700">已校验</span> : null}
                </p>
              </div>
            )}

            <button className="btn-primary mt-2 w-full" type="submit" disabled={submitLoading || !cdkValid}>
              {submitLoading ? "提交中..." : "提交登录信息"}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-sm text-[var(--text-muted)]">需要查看处理进度？</p>
            <button
              className="btn-pill"
              type="button"
              onClick={() => {
                setQueryVisible(true);
                if (!queryCaptchaId) {
                  void loadQueryCaptcha();
                }
              }}
            >
              查询开卡进度
            </button>
          </div>

          {message ? <p className="mt-4 text-sm text-[var(--danger)]">{message}</p> : null}
        </section>
      </div>

      {queryVisible ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-[0_20px_55px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="h-display text-xl font-semibold">开卡进度查询</h3>
              <button
                className="btn-pill"
                type="button"
                onClick={() => {
                  setQueryVisible(false);
                  setQueryMessage("");
                }}
              >
                关闭
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              支持 CDK 或手机号查询。单 IP 连续失败 5 次将限制 1 小时。
            </p>

            <form className="mt-4 grid gap-3" onSubmit={onQuery}>
              <select
                className="field"
                value={queryType}
                onChange={(e) => setQueryType(e.target.value as "token" | "phone")}
              >
                <option value="token">按 CDK 查询</option>
                <option value="phone">按手机号查询</option>
              </select>
              <input
                className="field"
                placeholder={queryType === "token" ? "请输入 CDK" : "请输入手机号"}
                value={queryValue}
                onChange={(e) => setQueryValue(e.target.value)}
              />
              <div className="grid grid-cols-[1fr_140px] gap-3">
                <input
                  className="field"
                  placeholder="输入字母验证码"
                  value={queryCaptchaCode}
                  onChange={(e) => setQueryCaptchaCode(e.target.value)}
                />
                <button
                  type="button"
                  className="field flex items-center justify-center bg-white p-0 text-black"
                  onClick={() => void loadQueryCaptcha()}
                >
                  {queryCaptchaSvg ? (
                    <span className="block h-full w-full" dangerouslySetInnerHTML={{ __html: queryCaptchaSvg }} />
                  ) : (
                    "加载中..."
                  )}
                </button>
              </div>

              <button className="btn-primary mt-1 w-full" type="submit" disabled={queryLoading}>
                {queryLoading ? "查询中..." : "查询进度"}
              </button>
            </form>

            {queryMessage ? <p className="mt-3 text-sm text-[var(--danger)]">{queryMessage}</p> : null}
            {queryResult ? (
              <div className="mt-3 rounded-[10px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-3 text-sm text-[var(--text-muted)]">
                <p>手机号：{queryResult.phoneMasked || "-"}</p>
                <p>CDK：{queryResult.token}</p>
                <p>CDK 状态：{statusLabel(queryResult.tokenStatus)}</p>
                <p>开卡状态：{rechargeStatusLabel(queryResult.rechargeStatus)}</p>
                <p>最近更新：{queryResult.updatedAt ? new Date(queryResult.updatedAt).toLocaleString() : "-"}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
