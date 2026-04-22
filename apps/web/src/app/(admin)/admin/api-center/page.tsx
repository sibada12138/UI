"use client";

import { useState } from "react";
import Image from "next/image";
import { adminApiRequest } from "@/lib/admin-api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type TestResult = {
  status: "idle" | "running" | "ok" | "fail";
  detail: string;
  output: string;
};

function asJson(input: unknown) {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function initResult(): TestResult {
  return { status: "idle", detail: "未执行", output: "" };
}

export default function ApiCenterPage() {
  const [deviceId, setDeviceId] = useState("web-default-device");
  const [unloginToken, setUnloginToken] = useState("");
  const [phone, setPhone] = useState("13800138000");
  const [phoneCc, setPhoneCc] = useState("86");
  const [captcha, setCaptcha] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [cookie, setCookie] = useState("");
  const [channel, setChannel] = useState("网页");

  const [smsCaptchaImage, setSmsCaptchaImage] = useState("");
  const [results, setResults] = useState<Record<string, TestResult>>({});

  function setRunning(key: string) {
    setResults((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? initResult()), status: "running", detail: "执行中..." },
    }));
  }

  function setOk(key: string, detail: string, output: string) {
    setResults((prev) => ({
      ...prev,
      [key]: { status: "ok", detail, output },
    }));
  }

  function setFail(key: string, detail: string) {
    setResults((prev) => ({
      ...prev,
      [key]: { status: "fail", detail, output: detail },
    }));
  }

  function statusOf(key: string) {
    return results[key] ?? initResult();
  }

  async function runCase(
    key: string,
    name: string,
    run: () => Promise<unknown>,
    onSuccess?: (data: unknown) => void,
  ) {
    setRunning(key);
    try {
      const data = await run();
      if (onSuccess) {
        onSuccess(data);
      }
      setOk(key, "接口调用成功", asJson(data));
      pushToast({ type: "success", message: `${name}：成功` });
    } catch (error) {
      const text = toErrorMessage(error, "请求失败");
      setFail(key, text);
      pushToast({ type: "error", message: `${name}：${text}` });
    }
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-6">
        <h1 className="h-display section-title">API 中心</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          这里只测试美图外部接口链路（/api 目录对应的短信、扫码、VIP、充值能力），不测试站内页面接口。
        </p>
      </article>

      <article className="apple-panel p-6">
        <h2 className="h-display text-2xl font-semibold">测试参数</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input className="field" placeholder="deviceId" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
          <input className="field" placeholder="unloginToken" value={unloginToken} onChange={(e) => setUnloginToken(e.target.value)} />
          <input className="field" placeholder="手机号" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="field" placeholder="phoneCc" value={phoneCc} onChange={(e) => setPhoneCc(e.target.value)} />
          <input className="field" placeholder="图形验证码（手填）" value={captcha} onChange={(e) => setCaptcha(e.target.value)} />
          <input className="field" placeholder="短信验证码" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} />
          <input className="field" placeholder="qrCode" value={qrCode} onChange={(e) => setQrCode(e.target.value)} />
          <select className="field" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="网页">网页</option>
            <option value="联想">联想</option>
            <option value="Android">Android</option>
          </select>
          <input className="field md:col-span-2 xl:col-span-2" placeholder="Access-Token" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
          <input className="field md:col-span-2 xl:col-span-2" placeholder="Cookie（可选）" value={cookie} onChange={(e) => setCookie(e.target.value)} />
        </div>

        <div className="mt-4 rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-3">
          <p className="text-xs text-[var(--text-muted)]">短信图形验证码预览（sms/bootstrap 返回）</p>
          {smsCaptchaImage ? (
            <Image
              src={smsCaptchaImage}
              alt="短信图形验证码"
              width={400}
              height={96}
              unoptimized
              className="mt-2 h-20 w-full object-contain"
            />
          ) : (
            <p className="mt-2 text-sm text-[var(--text-subtle)]">未加载</p>
          )}
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">短信链路</h2>
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>接口</th>
                <th>路径</th>
                <th>状态</th>
                <th>结果</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>获取 UnloginToken + 图形验证码</td>
                <td className="font-mono text-xs">POST /admin/external/sms/bootstrap</td>
                <td>{statusOf("sms_bootstrap").detail}</td>
                <td>{statusOf("sms_bootstrap").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase(
                        "sms_bootstrap",
                        "短信初始化",
                        () => adminApiRequest("/admin/external/sms/bootstrap", { method: "POST", body: { deviceId } }),
                        (raw) => {
                          const data = raw as {
                            unloginToken?: string;
                            captchaMimeType?: string;
                            captchaBase64?: string;
                            phoneCc?: number;
                            deviceId?: string;
                          };
                          if (data.unloginToken) setUnloginToken(data.unloginToken);
                          if (data.phoneCc) setPhoneCc(String(data.phoneCc));
                          if (data.deviceId) setDeviceId(String(data.deviceId));
                          if (data.captchaMimeType && data.captchaBase64) {
                            setSmsCaptchaImage(`data:${data.captchaMimeType};base64,${data.captchaBase64}`);
                          }
                        },
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
              <tr>
                <td>发送短信验证码</td>
                <td className="font-mono text-xs">POST /admin/external/sms/send-code</td>
                <td>{statusOf("sms_send").detail}</td>
                <td>{statusOf("sms_send").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase("sms_send", "发送短信", () =>
                        adminApiRequest("/admin/external/sms/send-code", {
                          method: "POST",
                          body: { unloginToken, phone, phoneCc, captcha, deviceId },
                        }),
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
              <tr>
                <td>短信验证码登录</td>
                <td className="font-mono text-xs">POST /admin/external/sms/login</td>
                <td>{statusOf("sms_login").detail}</td>
                <td>{statusOf("sms_login").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase(
                        "sms_login",
                        "短信登录",
                        () =>
                          adminApiRequest("/admin/external/sms/login", {
                            method: "POST",
                            body: { unloginToken, phone, phoneCc, verifyCode, deviceId },
                          }),
                        (raw) => {
                          const data = raw as { accessToken?: string };
                          if (data.accessToken) {
                            setAccessToken(String(data.accessToken));
                          }
                        },
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">扫码链路</h2>
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>接口</th>
                <th>路径</th>
                <th>状态</th>
                <th>结果</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>创建扫码二维码</td>
                <td className="font-mono text-xs">POST /admin/external/qr/create</td>
                <td>{statusOf("qr_create").detail}</td>
                <td>{statusOf("qr_create").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase(
                        "qr_create",
                        "扫码创建",
                        () =>
                          adminApiRequest("/admin/external/qr/create", {
                            method: "POST",
                            body: { unloginToken, deviceId },
                          }),
                        (raw) => {
                          const data = raw as { qrCode?: string; unloginToken?: string; deviceId?: string };
                          if (data.qrCode) setQrCode(String(data.qrCode));
                          if (data.unloginToken) setUnloginToken(String(data.unloginToken));
                          if (data.deviceId) setDeviceId(String(data.deviceId));
                        },
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
              <tr>
                <td>查询扫码状态</td>
                <td className="font-mono text-xs">GET /admin/external/qr/status</td>
                <td>{statusOf("qr_status").detail}</td>
                <td>{statusOf("qr_status").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase(
                        "qr_status",
                        "扫码状态",
                        () =>
                          adminApiRequest(
                            `/admin/external/qr/status?qrCode=${encodeURIComponent(qrCode)}&unloginToken=${encodeURIComponent(unloginToken)}&deviceId=${encodeURIComponent(deviceId)}`,
                          ),
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
              <tr>
                <td>扫码执行登录</td>
                <td className="font-mono text-xs">POST /admin/external/qr/login</td>
                <td>{statusOf("qr_login").detail}</td>
                <td>{statusOf("qr_login").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase(
                        "qr_login",
                        "扫码登录",
                        () =>
                          adminApiRequest("/admin/external/qr/login", {
                            method: "POST",
                            body: { qrCode, unloginToken, deviceId },
                          }),
                        (raw) => {
                          const data = raw as { accessToken?: string };
                          if (data.accessToken) setAccessToken(String(data.accessToken));
                        },
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">VIP / 充值能力链路</h2>
        <div className="table-shell">
          <table className="table-basic">
            <thead>
              <tr>
                <th>接口</th>
                <th>路径</th>
                <th>状态</th>
                <th>结果</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>获取 VIP 总览</td>
                <td className="font-mono text-xs">POST /admin/external/vip/overview</td>
                <td>{statusOf("vip_overview").detail}</td>
                <td>{statusOf("vip_overview").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase("vip_overview", "VIP总览", () =>
                        adminApiRequest("/admin/external/vip/overview", {
                          method: "POST",
                          body: { accessToken, cookie },
                        }),
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
              <tr>
                <td>检查充值能力（单渠道）</td>
                <td className="font-mono text-xs">POST /admin/recharge/tasks/capability/check</td>
                <td>{statusOf("capability_single").detail}</td>
                <td>{statusOf("capability_single").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase("capability_single", "单渠道能力检查", () =>
                        adminApiRequest("/admin/recharge/tasks/capability/check", {
                          method: "POST",
                          body: { accessToken, cookie, checkAll: false, channel },
                        }),
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
              <tr>
                <td>检查充值能力（全部渠道）</td>
                <td className="font-mono text-xs">POST /admin/recharge/tasks/capability/check</td>
                <td>{statusOf("capability_all").detail}</td>
                <td>{statusOf("capability_all").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase("capability_all", "全部渠道能力检查", () =>
                        adminApiRequest("/admin/recharge/tasks/capability/check", {
                          method: "POST",
                          body: { accessToken, cookie, checkAll: true },
                        }),
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="h-display text-xl font-semibold">调试输出</h2>
        <div className="mt-3 grid gap-3">
          {Object.entries(results).map(([key, result]) => (
            <details key={key} className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {key} - {result.status}
              </summary>
              <pre className="mt-2 overflow-auto rounded-[8px] border border-[var(--card-border)] bg-white p-3 text-xs leading-5">
{result.output || "暂无输出"}
              </pre>
            </details>
          ))}
          {Object.keys(results).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">执行任意接口后，这里会展示完整返回数据。</p>
          ) : null}
        </div>
      </article>
    </section>
  );
}
