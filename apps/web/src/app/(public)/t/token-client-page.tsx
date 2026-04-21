"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { toErrorMessage } from "@/lib/error-message";
import { ThemeToggle } from "@/components/theme-toggle";

type TokenStatusResponse = {
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

function isTokenFormatValid(value: string) {
  return /^tk_[a-zA-Z0-9_-]{8,}$/.test(value.trim());
}

function statusLabel(status?: string) {
  if (status === "active") return "可使用";
  if (status === "consumed") return "已提交";
  if (status === "expired") return "已过期";
  if (status === "revoked") return "已撤销";
  return status || "-";
}

export default function TokenClientPage({ initialToken = "" }: Props) {
  const [token, setToken] = useState(initialToken);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<TokenStatusResponse | null>(null);

  const [queryType, setQueryType] = useState<"token" | "phone">("token");
  const [queryValue, setQueryValue] = useState(initialToken);
  const [captchaId, setCaptchaId] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [queryMessage, setQueryMessage] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);

  const tokenValid = useMemo(() => isTokenFormatValid(token), [token]);

  async function loadTokenStatus(nextToken: string) {
    const value = nextToken.trim();
    if (!isTokenFormatValid(value)) {
      setStatus(null);
      return;
    }
    try {
      const data = await apiRequest<TokenStatusResponse>(
        `/public/token/${encodeURIComponent(value)}/status`,
      );
      setStatus(data);
    } catch (error) {
      setStatus(null);
      setMessage(toErrorMessage(error, "读取 token 状态失败"));
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
      setToken(initialToken);
      setQueryValue(initialToken);
      void loadTokenStatus(initialToken);
    }
  }, [initialToken]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!token.trim()) {
      setMessage("请先填写 token。");
      return;
    }
    if (!tokenValid) {
      setMessage("token 格式不正确，无法提交。");
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
        body: { token: token.trim(), phone, smsCode },
      });
      setMessage(`提交成功：${result.phoneMasked}，状态：${statusLabel(result.status)}`);
      await loadTokenStatus(token.trim());
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
    <main className="min-h-screen bg-[var(--hero-bg)] px-6 py-12 text-[var(--hero-text)] md:px-10">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
        <div>
          <p className="text-sm text-white/65">Recharge Card System</p>
          <h1 className="h-display mt-2 text-4xl font-semibold leading-[1.07] md:text-5xl">
            用户登录与开卡进度查询
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70">
            URL 中的 token 会自动填入。token 为空或格式不正确无法提交；连续错误 5 次将限制 1 小时。
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-2">
        <section className="apple-panel p-6">
          <h2 className="h-display text-3xl font-semibold text-[var(--page-text)]">短信登录提交</h2>
          <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
            <label className="text-sm text-[var(--text-subtle)]" htmlFor="token">
              Token
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <input
                id="token"
                className="field font-mono"
                placeholder="请输入 token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button
                type="button"
                className="btn-pill"
                onClick={() => void loadTokenStatus(token)}
                disabled={!tokenValid}
              >
                校验状态
              </button>
            </div>

            {status ? (
              <div className="rounded-[10px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
                <p>当前状态：{statusLabel(status.status)}</p>
                <p>过期时间：{new Date(status.expiresAt).toLocaleString()}</p>
                {status.consumedAt ? (
                  <p>提交时间：{new Date(status.consumedAt).toLocaleString()}</p>
                ) : null}
              </div>
            ) : null}

            <label className="text-sm text-[var(--text-subtle)]" htmlFor="phone">
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

            <label className="text-sm text-[var(--text-subtle)]" htmlFor="smsCode">
              短信验证码
            </label>
            <input
              id="smsCode"
              className="field"
              placeholder="请输入短信验证码"
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value)}
            />

            <button className="btn-primary mt-2 w-full" type="submit" disabled={submitLoading || !tokenValid}>
              {submitLoading ? "提交中..." : "提交登录信息"}
            </button>
          </form>
          {message ? <p className="mt-4 text-sm text-[var(--danger)]">{message}</p> : null}
        </section>

        <section className="apple-panel p-6">
          <h2 className="h-display text-3xl font-semibold text-[var(--page-text)]">开卡进度查询</h2>
          <form className="mt-5 grid gap-4" onSubmit={onQuery}>
            <label className="text-sm text-[var(--text-subtle)]" htmlFor="queryType">
              查询方式
            </label>
            <select
              id="queryType"
              className="field"
              value={queryType}
              onChange={(e) => setQueryType(e.target.value as "token" | "phone")}
            >
              <option value="token">按 token 查询</option>
              <option value="phone">按手机号查询</option>
            </select>
            <label className="text-sm text-[var(--text-subtle)]" htmlFor="queryValue">
              查询值
            </label>
            <input
              id="queryValue"
              className="field"
              placeholder={queryType === "token" ? "请输入 token" : "请输入手机号"}
              value={queryValue}
              onChange={(e) => setQueryValue(e.target.value)}
            />

            <label className="text-sm text-[var(--text-subtle)]" htmlFor="captchaCode">
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
                className="field flex items-center justify-center bg-white p-0"
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
              <p>Token：{queryResult.token}</p>
              <p>Token 状态：{statusLabel(queryResult.tokenStatus)}</p>
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
