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
  const [cdk, setCdk] = useState(initialToken);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
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
    <main className="min-h-screen bg-[var(--surface-accent)] px-4 py-8 text-[var(--page-text)] md:px-10 md:py-12">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--text-muted)]">CDK 用户入口</p>
          <h1 className="h-display mt-2 text-4xl font-semibold leading-[1.1] md:text-5xl">
            CDK 登录与进度查询
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">
            URL 中 CDK 会自动填充。CDK 为空或无效无法提交；单 IP 连续失败 5 次将被限制 1 小时。
          </p>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-2">
        <section className="apple-panel p-6">
          <h2 className="h-display text-2xl font-semibold">CDK 登录提交</h2>
          <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
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
            <input
              id="smsCode"
              className="field"
              placeholder="请输入短信验证码"
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value)}
            />

            <button className="btn-primary mt-2 w-full" type="submit" disabled={submitLoading || !cdkValid}>
              {submitLoading ? "提交中..." : "提交登录信息"}
            </button>
          </form>
          {message ? <p className="mt-4 text-sm text-[var(--danger)]">{message}</p> : null}
        </section>

        <section className="apple-panel p-6">
          <h2 className="h-display text-2xl font-semibold">开卡进度查询</h2>
          <form className="mt-4 grid gap-4" onSubmit={onQuery}>
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
      </div>
    </main>
  );
}
