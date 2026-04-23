"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { fetchAdminAccounts, type AdminAccountItem } from "@/lib/admin-accounts";
import { adminApiRequest } from "@/lib/admin-api";
import { apiRequest } from "@/lib/api";
import { toErrorMessage } from "@/lib/error-message";
import { pushToast } from "@/lib/toast";

type TestResult = {
  status: "idle" | "running" | "ok" | "fail";
  detail: string;
  output: string;
};

type SmsBootstrapResponse = {
  unloginToken?: string;
  captchaMimeType?: string;
  captchaBase64?: string;
  captchaAutoText?: string | null;
  captchaAutoError?: string | null;
  phoneCc?: number | string;
  deviceId?: string;
};

const BUILD_STAMP = "api-center-2026-04-23-v2";

function asJson(input: unknown) {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function initResult(): TestResult {
  return {
    status: "idle",
    detail: "未执行",
    output: "",
  };
}

export default function ApiCenterPage() {
  const [deviceId, setDeviceId] = useState("web-default-device");
  const [unloginToken, setUnloginToken] = useState("");
  const [phone, setPhone] = useState("13800138000");
  const [phoneCc, setPhoneCc] = useState("86");
  const [verifyCode, setVerifyCode] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [cookie, setCookie] = useState("");
  const [channel, setChannel] = useState("网页");

  const [accounts, setAccounts] = useState<AdminAccountItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const [smsCaptchaImage, setSmsCaptchaImage] = useState("");
  const [smsCaptchaAutoText, setSmsCaptchaAutoText] = useState("");
  const [smsCaptchaAutoError, setSmsCaptchaAutoError] = useState("");
  const [results, setResults] = useState<Record<string, TestResult>>({});

  const selectedAccount = useMemo(
    () => accounts.find((item) => item.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );
  const hasAccessToken = Boolean(accessToken.trim());

  function statusOf(key: string) {
    return results[key] ?? initResult();
  }

  function setRunning(key: string) {
    setResults((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? initResult()),
        status: "running",
        detail: "执行中...",
      },
    }));
  }

  function setOk(key: string, output: unknown) {
    setResults((prev) => ({
      ...prev,
      [key]: {
        status: "ok",
        detail: "调用成功",
        output: asJson(output),
      },
    }));
  }

  function setFail(key: string, detail: string) {
    setResults((prev) => ({
      ...prev,
      [key]: {
        status: "fail",
        detail,
        output: detail,
      },
    }));
  }

  function applyAccount(accountId: string, source: AdminAccountItem[]) {
    setSelectedAccountId(accountId);
    const target = source.find((item) => item.id === accountId);
    if (!target) {
      return;
    }
    setPhone(target.phone || "");
    setAccessToken(target.accessToken || "");
    setCookie(target.cookie || "");
  }

  async function loadAccounts() {
    try {
      const items = await fetchAdminAccounts();
      setAccounts(items);

      if (items.length === 0) {
        setSelectedAccountId("");
        return;
      }

      const current = items.find((item) => item.id === selectedAccountId);
      const currentHasToken = Boolean(String(current?.accessToken ?? "").trim());
      const target =
        (current && currentHasToken ? current : undefined) ??
        items.find((item) => String(item.accessToken ?? "").trim()) ??
        current ??
        items[0];

      if (target) {
        applyAccount(target.id, items);
      }
    } catch (error) {
      pushToast({
        type: "error",
        title: "加载失败",
        message: toErrorMessage(error, "账户列表加载失败"),
      });
    }
  }

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ensureAccessToken(actionName: string) {
    if (accessToken.trim()) {
      return true;
    }
    const fromSelected = String(selectedAccount?.accessToken ?? "").trim();
    if (fromSelected) {
      setAccessToken(fromSelected);
      return true;
    }
    const fallback = accounts.find((item) => String(item.accessToken ?? "").trim());
    if (fallback) {
      applyAccount(fallback.id, accounts);
      setAccessToken(String(fallback.accessToken).trim());
      return true;
    }
    pushToast({
      type: "warning",
      title: "缺少 AccessToken",
      message: `${actionName} 需要 AccessToken，请先完成登录提交。`,
    });
    return false;
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
      onSuccess?.(data);
      setOk(key, data);
      pushToast({ type: "success", title: "调用成功", message: `${name} 已完成` });
    } catch (error) {
      const text = toErrorMessage(error, "请求失败");
      setFail(key, text);
      pushToast({ type: "error", title: `${name}失败`, message: text });
    }
  }

  return (
    <section className="grid gap-5">
      <article className="apple-panel p-6">
        <h1 className="h-display section-title">API 中心</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          用于测试项目目录 `api/` 对应的美图链路：短信、扫码、VIP、渠道可用性。
        </p>
        <p className="mt-2 text-xs text-[var(--text-subtle)]">前端构建标识：{BUILD_STAMP}</p>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">系统链路</h2>
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
                <td>API 服务标识</td>
                <td className="font-mono text-xs">GET /api</td>
                <td>{statusOf("system_ping").detail}</td>
                <td>{statusOf("system_ping").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() => void runCase("system_ping", "API服务标识", () => apiRequest("/", { method: "GET" }))}
                  >
                    执行
                  </button>
                </td>
              </tr>
              <tr>
                <td>账户列表</td>
                <td className="font-mono text-xs">GET /admin/recharge/tasks/accounts</td>
                <td>{statusOf("system_accounts").detail}</td>
                <td>{statusOf("system_accounts").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() => void runCase("system_accounts", "账户列表", () => adminApiRequest("/admin/recharge/tasks/accounts"))}
                  >
                    执行
                  </button>
                </td>
              </tr>
              <tr>
                <td>任务通知轮询</td>
                <td className="font-mono text-xs">GET /admin/recharge/tasks/notifications</td>
                <td>{statusOf("system_notifications").detail}</td>
                <td>{statusOf("system_notifications").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase(
                        "system_notifications",
                        "任务通知轮询",
                        () =>
                          adminApiRequest(
                            `/admin/recharge/tasks/notifications?since=${encodeURIComponent(new Date(Date.now() - 5 * 60 * 1000).toISOString())}&limit=5`,
                          ),
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

      <article className="apple-panel p-6">
        <h2 className="h-display text-2xl font-semibold">测试参数</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            className="field md:col-span-2"
            value={selectedAccountId}
            onChange={(e) => applyAccount(e.target.value, accounts)}
          >
            <option value="">从账户中心选择账号</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {(item.phoneMasked || item.phone || "-") + " | " + item.token + " | " + item.status}
              </option>
            ))}
          </select>
          <button className="btn-pill md:col-span-2" type="button" onClick={() => void loadAccounts()}>
            刷新账户列表
          </button>

          <input className="field" placeholder="deviceId" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
          <input className="field" placeholder="unloginToken" value={unloginToken} onChange={(e) => setUnloginToken(e.target.value)} />
          <input className="field" placeholder="手机号" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="field" placeholder="phoneCc" value={phoneCc} onChange={(e) => setPhoneCc(e.target.value)} />
          <input className="field" placeholder="短信验证码" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} />
          <input className="field" placeholder="qrCode" value={qrCode} onChange={(e) => setQrCode(e.target.value)} />
          <select className="field" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="网页">网页</option>
            <option value="联想">联想</option>
            <option value="Android">Android</option>
          </select>
          <input
            className={`field md:col-span-2 xl:col-span-2 ${hasAccessToken ? "" : "field-error"}`}
            placeholder="AccessToken"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
          <input
            className="field md:col-span-2 xl:col-span-2"
            placeholder="Cookie（可选）"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
          />
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          当前账户 AccessToken：{hasAccessToken ? "已就绪" : "缺失（请先完成登录提交）"}
        </p>

        <div className="mt-4 rounded-[12px] border border-[var(--card-border)] bg-[var(--card-bg-soft)] p-3">
          <p className="text-xs text-[var(--text-muted)]">短信图形验证码预览（当前验证码）</p>
          {smsCaptchaImage ? (
            <Image
              src={smsCaptchaImage}
              alt="短信图形验证码"
              width={420}
              height={96}
              unoptimized
              className="mt-2 h-20 w-full object-contain"
            />
          ) : (
            <p className="mt-2 text-sm text-[var(--text-subtle)]">未加载</p>
          )}
          <div className="mt-2 grid gap-1 text-xs text-[var(--text-muted)]">
            <p>YOLO 识别结果：{smsCaptchaAutoText || "-"}</p>
            <p>
              YOLO 识别状态：
              {smsCaptchaAutoError ? `失败（${smsCaptchaAutoError}）` : smsCaptchaAutoText ? "成功" : "-"}
            </p>
          </div>
        </div>
      </article>

      <article className="apple-panel p-4">
        <h2 className="mb-3 text-xl font-semibold">短信链路</h2>
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          先单独获取验证码，再对当前验证码执行 YOLO 识别，最后再发短信，便于定位是取图问题还是识别问题。
        </p>
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
                        () =>
                          adminApiRequest("/admin/external/sms/bootstrap", {
                            method: "POST",
                            body: { deviceId, autoOcr: false },
                          }),
                        (raw) => {
                          const data = raw as SmsBootstrapResponse;
                          if (data.unloginToken) setUnloginToken(String(data.unloginToken));
                          if (data.phoneCc != null) setPhoneCc(String(data.phoneCc));
                          if (data.deviceId) setDeviceId(String(data.deviceId));
                          if (data.captchaMimeType && data.captchaBase64) {
                            setSmsCaptchaImage(`data:${data.captchaMimeType};base64,${data.captchaBase64}`);
                          }
                          setSmsCaptchaAutoText(String(data.captchaAutoText ?? ""));
                          setSmsCaptchaAutoError(String(data.captchaAutoError ?? ""));
                        },
                      )
                    }
                  >
                    执行
                  </button>
                </td>
              </tr>
              <tr>
                <td>YOLO 识别当前验证码</td>
                <td className="font-mono text-xs">POST /captcha/recognize</td>
                <td>{statusOf("sms_yolo").detail}</td>
                <td>{statusOf("sms_yolo").status}</td>
                <td>
                  <button
                    className="btn-pill"
                    type="button"
                    onClick={() =>
                      void runCase(
                        "sms_yolo",
                        "YOLO识别",
                        async () => {
                          if (!smsCaptchaImage) {
                            throw new Error("请先获取图形验证码");
                          }
                          return apiRequest<{
                            success: boolean;
                            message?: string;
                            data?: { text?: string; detections?: unknown[] };
                          }>("/captcha/recognize", {
                            method: "POST",
                            body: {
                              imageBase64: smsCaptchaImage,
                            },
                          });
                        },
                        (raw) => {
                          const data = raw as {
                            success: boolean;
                            message?: string;
                            data?: { text?: string };
                          };
                          if (!data.success) {
                            throw new Error(data.message || "YOLO识别失败");
                          }
                          const text = String(data.data?.text ?? "").trim();
                          if (!text) {
                            throw new Error("YOLO未识别出验证码");
                          }
                          setSmsCaptchaAutoText(text);
                          setSmsCaptchaAutoError("");
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
                          body: {
                            unloginToken,
                            phone,
                            phoneCc,
                            deviceId,
                            captcha: smsCaptchaAutoText || undefined,
                          },
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
                            body: {
                              unloginToken,
                              phone,
                              phoneCc,
                              verifyCode,
                              deviceId,
                            },
                          }),
                        (raw) => {
                          const data = raw as { accessToken?: string; cookie?: string };
                          if (data.accessToken) {
                            setAccessToken(String(data.accessToken));
                          }
                          if (data.cookie) {
                            setCookie(String(data.cookie));
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
                      void runCase("qr_status", "扫码状态", () =>
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
                <td>扫码登录</td>
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
                          const data = raw as { accessToken?: string; cookie?: string };
                          if (data.accessToken) setAccessToken(String(data.accessToken));
                          if (data.cookie) setCookie(String(data.cookie));
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
                    onClick={() => {
                      if (!ensureAccessToken("VIP 查询")) return;
                      void runCase("vip_overview", "VIP总览", () =>
                        adminApiRequest("/admin/external/vip/overview", {
                          method: "POST",
                          body: { accessToken, cookie },
                        }),
                      );
                    }}
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
                    onClick={() => {
                      if (!ensureAccessToken("单渠道能力检测")) return;
                      void runCase("capability_single", "单渠道能力检测", () =>
                        adminApiRequest("/admin/recharge/tasks/capability/check", {
                          method: "POST",
                          body: { accessToken, cookie, checkAll: false, channel },
                        }),
                      );
                    }}
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
                    onClick={() => {
                      if (!ensureAccessToken("全渠道能力检测")) return;
                      void runCase("capability_all", "全渠道能力检测", () =>
                        adminApiRequest("/admin/recharge/tasks/capability/check", {
                          method: "POST",
                          body: { accessToken, cookie, checkAll: true },
                        }),
                      );
                    }}
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
