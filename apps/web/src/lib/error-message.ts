const MESSAGE_MAP: Record<string, string> = {
  NETWORK_ERROR: "网络请求失败，请检查服务是否启动或反向代理配置。",
  CAPTCHA_INVALID: "验证码错误，请重新输入。",
  QUERY_BANNED_1H: "查询失败次数过多，已被限制 1 小时。",
  NO_RECORD: "未查询到记录，请确认 CDK 或手机号。",
  TOKEN_NOT_FOUND: "CDK 不存在，请检查后重试。",
  TOKEN_INVALID: "CDK 无效或已失效。",
  TOKEN_EXPIRED: "CDK 已过期。",
  TOKEN_REQUIRED: "请先填写 CDK。",
  TOKEN_SUBMIT_BANNED_1H: "提交失败次数过多，已被限制 1 小时。",
  SMS_SESSION_INVALID: "短信会话已失效，请重新发送短信验证码。",
  SMS_SESSION_REQUIRED: "请先发送短信验证码。",
  SMS_SESSION_PHONE_MISMATCH: "手机号与本次短信会话不一致，请重新发送验证码。",
  CAPTCHA_REQUIRED: "验证码参数缺失。",
  CAPTCHA_AUTO_RECOGNIZE_FAILED: "图形验证码自动识别失败，请稍后重试。",
  SMS_WAIT: "发送过于频繁，请稍后再试。",
  QR_SESSION_INVALID: "扫码会话已过期，请刷新二维码。",
  QR_SESSION_REQUIRED: "请先发起扫码登录。",
  QR_LOGIN_REQUIRED: "请先完成扫码并确认登录。",
  EXTERNAL_LOGIN_FAILED: "外部登录校验失败，请重试。",
  EXTERNAL_ACCESS_TOKEN_REQUIRED: "外部模式下必须填写 Access-Token。",
  EXTERNAL_NETWORK_ERROR: "外部接口网络异常，请稍后重试。",
  EXTERNAL_RESPONSE_INVALID_JSON: "外部接口返回异常数据，请稍后重试。",
  UNLOGIN_TOKEN_MISSING: "登录初始化失败，请刷新重试。",
  EXTERNAL_API_FAILED: "外部接口校验失败，请检查账号状态后重试。",
  RECHARGE_PRICE_NOT_ALLOWED: "接口返回充值价格异常（大于 1.1），已阻止继续下单。",
  RECHARGE_PAYMENT_URL_NOT_FOUND: "未从外部响应中解析出支付链接，请检查接口参数。",
  RECHARGE_TASK_NOT_FOUND: "待办任务不存在或已删除。",
  TOKEN_ALREADY_CONSUMED: "CDK 已被使用，无法解封。",
  PHONE_INVALID: "手机号格式不正确。",
  SMSCODE_INVALID: "短信验证码格式不正确。",
  ADMIN_NOT_FOUND: "管理员账号不存在或已禁用。",
  PASSWORD_INVALID: "密码错误。",
  MISSING_ADMIN_TOKEN: "登录已失效，请重新登录。",
  SESSION_EXPIRED: "登录会话已过期，请重新登录。",
  INSUFFICIENT_ROLE: "当前账号权限不足。",
};

export function toErrorMessage(error: unknown, fallback = "请求失败，请稍后重试。") {
  const raw = error instanceof Error ? error.message : "";
  if (!raw) {
    return fallback;
  }
  return MESSAGE_MAP[raw] ?? raw;
}
