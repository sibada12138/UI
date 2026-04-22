"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { adminApiRequest } from "@/lib/admin-api";
import { apiRequest } from "@/lib/api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type CaseState = {
  status: "idle" | "running" | "ok" | "fail";
  detail: string;
  output: string;
};

type CaseItem = {
  key: string;
  name: string;
  method: "GET" | "POST";
  path: string;
  run: () => Promise<unknown>;
};

function asJsonText(input: unknown) {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function initialCaseState(): CaseState {
  return { status: "idle", detail: "未执行", output: "" };
}

export default function ApiCenterPage() {
  const [token, setToken] = useState("tk_demo_token");
  const [phone, setPhone] = useState("13800138000");
  const [smsCaptcha, setSmsCaptcha] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsSessionId, setSmsSessionId] = useState("");
  const [qrSessionId, setQrSessionId] = useState("");

  const [queryType, setQueryType] = useState<"token" | "phone">("token");
  const [queryValue, setQueryValue] = useState("tk_demo_token");
  const [queryCaptchaId, setQueryCaptchaId] = useState("");
  const [queryCaptchaCode, setQueryCaptchaCode] = useState("");
  const [queryCaptchaSvg, setQueryCaptchaSvg] = useState("");

  const [smsCaptchaImage, setSmsCaptchaImage] = useState("");
  const [qrImageData, setQrImageData] = useState("");
  const [states, setStates] = useState<Record<string, CaseState>>({});

  const cases = useMemo<CaseItem[]>(
    () => [
      {
        key: "admin-dashboard",
        name: "后台统计",
        method: "GET",
        path: "/admin/dashboard/metrics",
        run: () => adminApiRequest("/admin/dashboard/metrics"),
      },
      {
        key: "admin-recharge-tasks",
        name: "待办任务列表",
        method: "GET",
        path: "/admin/recharge/tasks",
        run: () => adminApiRequest("/admin/recharge/tasks"),
      },
      {
        key: "public-token-status",
        name: "CDK 状态查询",
        method: "GET",
        path: "/public/token/:token/status",
        run: () => apiRequest(`/public/token/${encodeURIComponent(token.trim())}/status`),
      },
      {
        key: "public-sms-bootstrap",
        name: "短信初始化（图形码）",
        method: "POST",
        path: "/public/token/sms/bootstrap",
        run: async () => {
          const data = await apiRequest<{
            smsSessionId: string;
            captchaImageDataUrl: string;
          }>("/public/token/sms/bootstrap", {
            method: "POST",
            body: { token: token.trim() },
          });
          setSmsSessionId(data.smsSessionId);
          setSmsCaptchaImage(data.captchaImageDataUrl);
          return data;
        },
      },
      {
        key: "public-send-sms",
        name: "发送短信验证码",
        method: "POST",
        path: "/public/token/send-sms",
        run: () =>
          apiRequest("/public/token/send-sms", {
            method: "POST",
            body: {
              token: token.trim(),
              phone: phone.trim(),
              captcha: smsCaptcha.trim(),
              smsSessionId: smsSessionId.trim(),
            },
          }),
      },
      {
        key: "public-qr-create",
        name: "扫码初始化（生成二维码）",
        method: "POST",
        path: "/public/token/qr/create",
        run: async () => {
          const data = await apiRequest<{
            qrSessionId: string;
            qrImageDataUrl: string;
          }>("/public/token/qr/create", {
            method: "POST",
            body: { token: token.trim() },
          });
          setQrSessionId(data.qrSessionId);
          setQrImageData(data.qrImageDataUrl);
          return data;
        },
      },
      {
        key: "public-qr-status",
        name: "扫码状态查询",
        method: "GET",
        path: "/public/token/qr/:sessionId/status",
        run: () =>
          apiRequest(`/public/token/qr/${encodeURIComponent(qrSessionId.trim())}/status`),
      },
      {
        key: "public-qr-login",
        name: "扫码登录确认",
        method: "POST",
        path: "/public/token/qr/login",
        run: () =>
          apiRequest("/public/token/qr/login", {
            method: "POST",
            body: {
              token: token.trim(),
              qrSessionId: qrSessionId.trim(),
            },
          }),
      },
      {
        key: "public-submit-sms",
        name: "提交登录（短信模式）",
        method: "POST",
        path: "/public/token/submit",
        run: () =>
          apiRequest("/public/token/submit", {
            method: "POST",
            body: {
              token: token.trim(),
              phone: phone.trim(),
              smsCode: smsCode.trim(),
              loginMode: "sms",
              smsSessionId: smsSessionId.trim(),
            },
          }),
      },
      {
        key: "public-submit-qr",
        name: "提交登录（扫码模式）",
        method: "POST",
        path: "/public/token/submit",
        run: () =>
          apiRequest("/public/token/submit", {
            method: "POST",
            body: {
              token: token.trim(),
              phone: phone.trim(),
              loginMode: "qr",
              qrSessionId: qrSessionId.trim(),
            },
          }),
      },
      {
        key: "public-query-captcha",
        name: "查询验证码",
        method: "POST",
        path: "/public/captcha/create",
        run: async () => {
          const data = await apiRequest<{ captchaId: string; captchaSvg: string }>(
            "/public/captcha/create",
            { method: "POST" },
          );
          setQueryCaptchaId(data.captchaId);
          setQueryCaptchaSvg(data.captchaSvg);
          return data;
        },
      },
      {
        key: "public-query",
        name: "开卡进度查询",
        method: "POST",
        path: "/public/query",
        run: () =>
          apiRequest("/public/query", {
            method: "POST",
            body: {
              queryType,
              queryValue: queryValue.trim(),
              captchaId: queryCaptchaId.trim(),
              captchaCode: queryCaptchaCode.trim(),
            },
          }),
      },
      {
        key: "external-qr-create",
        name: "外部扫码接口",
        method: "POST",
        path: "/admin/external/qr/create",
        run: () =>
          adminApiRequest("/admin/external/qr/create", {
            method: "POST",
            body: { deviceId: "api-center-check" },
          }),
      },
    ],
    [phone, qrSessionId, queryCaptchaCode, queryCaptchaId, queryType, queryValue, smsCaptcha, smsCode, smsSessionId, token],
  );

  async function runCase(item: CaseItem) {
    setStates((prev) => ({
      ...prev,
      [item.key]: { status: "running", detail: "执行中...", output: prev[item.key]?.output ?? "" },
    }));
    try {
      const data = await item.run();
      setStates((prev) => ({
        ...prev,
        [item.key]: { status: "ok", detail: "功能正常", output: asJsonText(data) },
      }));
      pushToast({ type: "success", message: `${item.name}：通过` });
    } catch (error) {
      const msg = toErrorMessage(error, "请求失败");
      setStates((prev) => ({
        ...prev,
        [item.key]: { status: "fail", detail: msg, output: msg },
      }));
      pushToast({ type: "error", message: `${item.name}：${msg}` });
    }
  }

  function stateOf(key: string) {
    return states[key] ?? initialCaseState();
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-6">
        <h1 className="h-display section-title">API 中心</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          用于测试接口功能是否可用。逐项点击执行，直接查看返回内容或错误原因。
        </p>
      </article>

      <article className="apple-panel p-6">
        <h2 className="h-display text-2xl font-semibold">测试参数</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input className="field font-mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder="CDK" />
          <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手机号" />
          <input className="field" value={smsSessionId} onChange={(e) => setSmsSessionId(e.target.value)} placeholder="smsSessionId" />
          <input className="field" value={smsCaptcha} onChange={(e) => setSmsCaptcha(e.target.value)} placeholder="短信图形验证码" />
          <input className="field" value={smsCode} onChange={(e) => setSmsCode(e.target.value)} placeholder="短信验证码" />
          <input className="field" value={qrSessionId} onChange={(e) => setQrSessionId(e.target.value)} placeholder="qrSessionId" />
          <select className="field" value={queryType} onChange={(e) => setQueryType(e.target.value as "token" | "phone")}>
            <option value="token">按 CDK 查询</option>
            <option value="phone">按手机号查询</option>
          </select>
          <input className="field" value={queryValue} onChange={(e) => setQueryValue(e.target.value)} placeholder="查询值" />
          <input className="field" value={queryCaptchaId} onChange={(e) => setQueryCaptchaId(e.target.value)} placeholder="queryCaptchaId" />
          <input className="field" value={queryCaptchaCode} onChange={(e) => setQueryCaptchaCode(e.target.value)} placeholder="查询验证码" />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-3">
            <p className="text-xs text-[var(--text-muted)]">短信图形验证码</p>
            {smsCaptchaImage ? (
              <Image
                src={smsCaptchaImage}
                alt="sms captcha"
                width={320}
                height={64}
                unoptimized
                className="mt-2 h-16 w-full object-contain"
              />
            ) : (
              <p className="mt-2 text-sm text-[var(--text-subtle)]">未生成</p>
            )}
          </div>
          <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-3">
            <p className="text-xs text-[var(--text-muted)]">扫码二维码</p>
            {qrImageData ? (
              <Image
                src={qrImageData}
                alt="qr code"
                width={320}
                height={112}
                unoptimized
                className="mt-2 h-28 w-full object-contain"
              />
            ) : (
              <p className="mt-2 text-sm text-[var(--text-subtle)]">未生成</p>
            )}
          </div>
        </div>
      </article>

      <article className="apple-panel p-4">
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>接口名称</th>
                <th>请求</th>
                <th>状态</th>
                <th>结果</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((item) => {
                const state = stateOf(item.key);
                return (
                  <tr key={item.key}>
                    <td>{item.name}</td>
                    <td className="font-mono text-xs">{item.method} {item.path}</td>
                    <td>
                      <span className="status-pill">
                        {state.status === "idle" && "未执行"}
                        {state.status === "running" && "执行中"}
                        {state.status === "ok" && "通过"}
                        {state.status === "fail" && "失败"}
                      </span>
                    </td>
                    <td>{state.detail}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-pill"
                          type="button"
                          onClick={() => void runCase(item)}
                          disabled={state.status === "running"}
                        >
                          执行
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="h-display text-xl font-semibold">返回内容</h2>
        <div className="mt-3 grid gap-3">
          {cases.map((item) => {
            const state = stateOf(item.key);
            return (
              <details key={`output-${item.key}`} className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {item.name} - {state.status === "ok" ? "通过" : state.status === "fail" ? "失败" : "未执行"}
                </summary>
                <pre className="mt-2 overflow-auto rounded-[8px] border border-[var(--card-border)] bg-white p-3 text-xs leading-5">
{state.output || "暂无返回内容"}
                </pre>
              </details>
            );
          })}
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="h-display text-xl font-semibold">查询验证码预览</h2>
        <div className="mt-3 rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-3">
          {queryCaptchaSvg ? (
            <div dangerouslySetInnerHTML={{ __html: queryCaptchaSvg }} />
          ) : (
            <p className="text-sm text-[var(--text-subtle)]">先执行“查询验证码”接口。</p>
          )}
        </div>
      </article>
    </section>
  );
}
