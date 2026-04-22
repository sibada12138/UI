"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { apiRequest } from "@/lib/api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type CdkStatusResponse = {
  token: string;
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

type SendSmsResponse = {
  success: boolean;
  retryAfterSec?: number;
  smsSessionId?: string;
};

type QrCreateResponse = {
  qrSessionId: string;
  qrCode: string;
  qrImageDataUrl: string;
  expiresInSec: number;
};

type QrStatusResponse = {
  qrSessionId: string;
  verified: boolean;
  scanned: boolean;
  expired: boolean;
  raw: unknown;
};

type Props = {
  initialToken?: string;
};

const QR_POLL_INTERVAL_MS = 2000;

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

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function TokenClientPage({ initialToken = "" }: Props) {
  const [loginMode, setLoginMode] = useState<"sms" | "qr">("sms");
  const [cdk, setCdk] = useState(initialToken);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<CdkStatusResponse | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [smsSessionId, setSmsSessionId] = useState("");
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);

  const [qrSessionId, setQrSessionId] = useState("");
  const [qrImageData, setQrImageData] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrStatusText, setQrStatusText] = useState("请切换到扫码登录后自动加载二维码。");
  const [qrVerified, setQrVerified] = useState(false);
  const [qrExpired, setQrExpired] = useState(false);
  const [qrDeadlineAt, setQrDeadlineAt] = useState<number | null>(null);

  const [queryVisible, setQueryVisible] = useState(false);
  const [queryType, setQueryType] = useState<"token" | "phone">("token");
  const [queryValue, setQueryValue] = useState(initialToken);
  const [queryCaptchaId, setQueryCaptchaId] = useState("");
  const [queryCaptchaSvg, setQueryCaptchaSvg] = useState("");
  const [queryCaptchaCode, setQueryCaptchaCode] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryMessage, setQueryMessage] = useState("");

  const qrPollingBusyRef = useRef(false);
  const qrConfirmBusyRef = useRef(false);
  const qrLastConfirmAtRef = useRef(0);

  const cdkValid = useMemo(() => isCdkValid(cdk), [cdk]);
  const currentStep = useMemo(() => {
    if (!cdkValid) return 1;
    if (loginMode === "sms") {
      return smsCode.trim() && smsSessionId ? 3 : 2;
    }
    return qrVerified ? 3 : 2;
  }, [cdkValid, loginMode, qrVerified, smsCode, smsSessionId]);

  const submitDisabled = useMemo(() => {
    if (!cdkValid || submitLoading) return true;
    if (loginMode === "sms") {
      return !/^1\d{10}$/.test(phone.trim()) || !smsCode.trim() || !smsSessionId;
    }
    return !qrSessionId || !qrVerified;
  }, [cdkValid, loginMode, phone, qrSessionId, qrVerified, smsCode, smsSessionId, submitLoading]);

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
      setQueryMessage(toErrorMessage(error, "查询验证码加载失败"));
    }
  }

  async function sendSmsCode() {
    const normalizedPhone = phone.trim();
    if (!cdkValid) {
      setMessage("请先输入有效 CDK。");
      return;
    }
    if (!/^1\d{10}$/.test(normalizedPhone)) {
      setMessage("请输入正确的手机号。");
      return;
    }
    if (smsCountdown > 0) {
      return;
    }

    setMessage("");
    setSmsLoading(true);
    try {
      const data = await apiRequest<SendSmsResponse>("/public/token/send-sms", {
        method: "POST",
        body: {
          token: cdk.trim(),
          phone: normalizedPhone,
        },
      });
      setSmsCountdown(Math.max(1, Number(data.retryAfterSec ?? 60)));
      if (data.success) {
        setSmsSessionId(String(data.smsSessionId ?? ""));
        pushToast({ type: "success", message: "短信已发送，请输入验证码后提交。" });
      } else {
        pushToast({ type: "info", message: "短信发送过于频繁，请稍后重试。" });
      }
    } catch (error) {
      const text = toErrorMessage(error, "短信发送失败");
      setMessage(text);
      pushToast({ type: "error", message: text });
    } finally {
      setSmsLoading(false);
    }
  }

  async function createQrSession() {
    if (!cdkValid) {
      setQrSessionId("");
      setQrImageData("");
      setQrVerified(false);
      setQrExpired(false);
      setQrDeadlineAt(null);
      setQrStatusText("请输入有效 CDK 后自动加载二维码。");
      return;
    }

    setQrLoading(true);
    try {
      const data = await apiRequest<QrCreateResponse>("/public/token/qr/create", {
        method: "POST",
        body: { token: cdk.trim() },
      });
      const deadline = Date.now() + Math.min(120, Number(data.expiresInSec || 120)) * 1000;
      setQrSessionId(data.qrSessionId);
      setQrImageData(data.qrImageDataUrl);
      setQrVerified(false);
      setQrExpired(false);
      setQrDeadlineAt(deadline);
      setQrStatusText("二维码已加载，系统每 2 秒自动检查扫码状态。");
      pushToast({ type: "success", message: "扫码二维码已加载。" });
    } catch (error) {
      const text = toErrorMessage(error, "二维码加载失败");
      setMessage(text);
      setQrStatusText(text);
      pushToast({ type: "error", message: text });
    } finally {
      setQrLoading(false);
    }
  }

  async function tryConfirmQrLogin(silent = true) {
    if (!cdkValid || !qrSessionId || qrVerified || qrExpired) {
      return;
    }
    const now = Date.now();
    if (qrConfirmBusyRef.current || now - qrLastConfirmAtRef.current < 3500) {
      return;
    }
    qrLastConfirmAtRef.current = now;
    qrConfirmBusyRef.current = true;
    try {
      await apiRequest("/public/token/qr/login", {
        method: "POST",
        body: {
          token: cdk.trim(),
          qrSessionId,
        },
      });
      setQrVerified(true);
      setQrStatusText("扫码确认成功，可以提交登录信息。");
      pushToast({ type: "success", message: "扫码确认成功，可以提交。" });
    } catch (error) {
      const text = toErrorMessage(error, "扫码确认失败");
      if (!silent) {
        setMessage(text);
        pushToast({ type: "error", message: text });
      } else {
        setQrStatusText("已检测到扫码，等待客户端确认授权。");
      }
    } finally {
      qrConfirmBusyRef.current = false;
    }
  }

  async function pollQrStatus() {
    if (!qrSessionId || !qrDeadlineAt || qrVerified || qrExpired) {
      return;
    }
    if (qrPollingBusyRef.current) {
      return;
    }

    const remainMs = qrDeadlineAt - Date.now();
    if (remainMs <= 0) {
      setQrExpired(true);
      setQrStatusText("二维码已超时，请点击重新加载。");
      return;
    }

    qrPollingBusyRef.current = true;
    try {
      const data = await apiRequest<QrStatusResponse>(
        `/public/token/qr/${encodeURIComponent(qrSessionId)}/status`,
      );

      if (data.expired) {
        setQrExpired(true);
        setQrStatusText("二维码已过期，请点击重新加载。");
        return;
      }
      if (data.verified) {
        setQrVerified(true);
        setQrStatusText("扫码确认成功，可以提交登录信息。");
        return;
      }

      const remainSec = Math.max(1, Math.ceil((qrDeadlineAt - Date.now()) / 1000));
      if (data.scanned) {
        setQrStatusText(`检测到已扫码，正在确认授权（剩余 ${remainSec}s）...`);
        await tryConfirmQrLogin(true);
      } else {
        setQrStatusText(`等待扫码中（剩余 ${remainSec}s）...`);
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      if (raw === "QR_SESSION_INVALID") {
        setQrExpired(true);
        setQrStatusText("二维码已失效，请点击重新加载。");
        return;
      }
      setQrStatusText(toErrorMessage(error, "扫码状态检查失败"));
    } finally {
      qrPollingBusyRef.current = false;
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!cdkValid) {
      setMessage("请先填写正确的 CDK。");
      return;
    }

    if (loginMode === "sms") {
      if (!/^1\d{10}$/.test(phone.trim())) {
        setMessage("请输入正确的手机号。");
        return;
      }
      if (!smsSessionId) {
        setMessage("请先发送短信验证码。");
        return;
      }
      if (!smsCode.trim()) {
        setMessage("请输入短信验证码。");
        return;
      }
    } else {
      if (!qrSessionId) {
        setMessage("请先加载扫码二维码。");
        return;
      }
      if (!qrVerified) {
        setMessage("请先完成扫码确认。");
        return;
      }
    }

    const body =
      loginMode === "sms"
        ? {
            token: cdk.trim(),
            loginMode: "sms",
            phone: phone.trim(),
            smsCode: smsCode.trim(),
            smsSessionId,
          }
        : {
            token: cdk.trim(),
            loginMode: "qr",
            qrSessionId,
          };

    setSubmitLoading(true);
    try {
      await apiRequest("/public/token/submit", {
        method: "POST",
        body,
      });
      setMessage("提交成功，客服正在处理开卡。");
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
          captchaCode: queryCaptchaCode.trim(),
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

  useEffect(() => {
    void loadQueryCaptcha();
  }, []);

  useEffect(() => {
    if (!initialToken) {
      return;
    }
    setCdk(initialToken);
    setQueryValue(initialToken);
    void loadCdkStatus(initialToken);
  }, [initialToken]);

  useEffect(() => {
    if (smsCountdown <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setSmsCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsCountdown]);

  useEffect(() => {
    if (loginMode !== "qr") {
      return;
    }
    void createQrSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginMode, cdk]);

  useEffect(() => {
    if (loginMode !== "qr" || !qrSessionId || !qrDeadlineAt || qrVerified || qrExpired) {
      return;
    }
    void pollQrStatus();
    const timer = window.setInterval(() => {
      void pollQrStatus();
    }, QR_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginMode, qrSessionId, qrDeadlineAt, qrVerified, qrExpired]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f2f0eb_0%,#f6f5f2_45%,#ffffff_100%)] px-4 py-6 text-[var(--page-text)] md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-[16px] border border-[var(--card-border)] bg-white shadow-[0_0_0.5px_rgba(0,0,0,0.14),0_1px_1px_rgba(0,0,0,0.24)]">
          <div className="bg-[var(--brand-green-dark)] px-6 py-7 text-white md:px-8 md:py-9">
            <p className="inline-flex rounded-full border border-white/35 px-3 py-1 text-xs tracking-[0.08em] text-white/90">
              Recharge Card System
            </p>
            <h1 className="h-display mt-4 text-3xl font-semibold leading-[1.15] md:text-5xl">
              登录提交与进度查询
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
              通过 CDK 完成短信登录或扫码登录，提交后由客服进行后续充值处理。
            </p>
          </div>

          <div className="bg-white px-6 py-5 md:px-8">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { step: 1, label: "验证 CDK" },
                { step: 2, label: "登录验证" },
                { step: 3, label: "提交完成" },
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
                <p>过期时间：{formatDate(status.expiresAt)}</p>
                {status.consumedAt ? <p>提交时间：{formatDate(status.consumedAt)}</p> : null}
              </div>
            ) : null}

            <div className="mt-1 flex rounded-full border border-[var(--card-border)] bg-[var(--surface-quiet)] p-1">
              <button
                type="button"
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  loginMode === "sms"
                    ? "bg-white text-[var(--page-text)] shadow-sm"
                    : "text-[var(--text-muted)]"
                }`}
                onClick={() => setLoginMode("sms")}
              >
                短信登录
              </button>
              <button
                type="button"
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  loginMode === "qr"
                    ? "bg-white text-[var(--page-text)] shadow-sm"
                    : "text-[var(--text-muted)]"
                }`}
                onClick={() => setLoginMode("qr")}
              >
                扫码登录
              </button>
            </div>

            {loginMode === "sms" ? (
              <div className="grid gap-3 rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-4">
                <label className="text-sm text-[var(--text-muted)]" htmlFor="phone">
                  手机号
                </label>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    id="phone"
                    className="field"
                    placeholder="请输入手机号"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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

                <label className="text-sm text-[var(--text-muted)]" htmlFor="sms-code">
                  短信验证码
                </label>
                <input
                  id="sms-code"
                  className="field"
                  placeholder="请输入短信验证码"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid gap-3 rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-[var(--text-muted)]">{qrStatusText}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn-pill"
                      type="button"
                      onClick={() => void createQrSession()}
                      disabled={qrLoading}
                    >
                      {qrLoading ? "加载中..." : "重新加载二维码"}
                    </button>
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={() => void tryConfirmQrLogin(false)}
                      disabled={!qrSessionId || qrExpired || qrVerified}
                    >
                      手动确认扫码
                    </button>
                  </div>
                </div>

                {qrImageData ? (
                  <div className="rounded-[12px] border border-[var(--card-border)] bg-white p-4">
                    <Image
                      src={qrImageData}
                      alt="扫码二维码"
                      width={180}
                      height={180}
                      unoptimized
                      className={`mx-auto h-44 w-44 object-contain transition ${
                        qrVerified ? "blur-[3px] opacity-70" : ""
                      }`}
                    />
                    {qrVerified ? (
                      <p className="mt-2 text-center text-sm text-[var(--brand-green)]">
                        已确认扫码，可直接提交登录信息。
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            <button className="btn-primary mt-2 w-full" type="submit" disabled={submitDisabled}>
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
                <p>最近更新：{formatDate(queryResult.updatedAt)}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
