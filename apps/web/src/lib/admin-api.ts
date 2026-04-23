import { apiRequest, type ApiOptions } from "@/lib/api";
import { clearAdminToken, getAdminToken } from "@/lib/admin-auth";

type AdminApiOptions = Omit<ApiOptions, "token">;

const SESSION_ERROR_SET = new Set([
  "MISSING_ADMIN_TOKEN",
  "INVALID_ADMIN_TOKEN",
  "SESSION_EXPIRED",
  "ADMIN_DISABLED",
]);

function maskToken(token: string) {
  const value = String(token ?? "").trim();
  if (!value) {
    return "(empty)";
  }
  if (value.length <= 12) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function logAdminApiDebug(message: string, payload?: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }
  if (payload) {
    console.info("[AUTH_DEBUG][admin-api]", message, payload);
    return;
  }
  console.info("[AUTH_DEBUG][admin-api]", message);
}

function redirectToLogin(reason: string) {
  if (typeof window === "undefined") {
    return;
  }
  logAdminApiDebug("redirectToLogin", {
    reason,
    pathname: window.location.pathname,
  });
  clearAdminToken();
  if (window.location.pathname !== "/admin/login") {
    window.location.replace("/admin/login?reason=session");
  }
}

export async function adminApiRequest<T>(path: string, options: AdminApiOptions = {}) {
  const token = getAdminToken().trim();
  logAdminApiDebug("request start", {
    path,
    method: options.method ?? "GET",
    hasToken: Boolean(token),
    token: maskToken(token),
  });
  if (!token) {
    redirectToLogin("missing_local_token");
    throw new Error("SESSION_EXPIRED");
  }

  try {
    const result = await apiRequest<T>(path, { ...options, token });
    logAdminApiDebug("request success", { path });
    return result;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    logAdminApiDebug("request failed", {
      path,
      error: raw || String(error),
      isSessionError: SESSION_ERROR_SET.has(raw),
    });
    if (SESSION_ERROR_SET.has(raw)) {
      redirectToLogin(raw);
    }
    throw error;
  }
}
