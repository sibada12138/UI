import { apiRequest, type ApiOptions } from "@/lib/api";
import { clearAdminToken, getAdminToken } from "@/lib/admin-auth";

type AdminApiOptions = Omit<ApiOptions, "token">;

const SESSION_ERROR_SET = new Set([
  "MISSING_ADMIN_TOKEN",
  "INVALID_ADMIN_TOKEN",
  "SESSION_EXPIRED",
  "ADMIN_DISABLED",
]);

function redirectToLogin() {
  if (typeof window === "undefined") {
    return;
  }
  clearAdminToken();
  if (window.location.pathname !== "/admin/login") {
    window.location.replace("/admin/login?reason=session");
  }
}

export async function adminApiRequest<T>(path: string, options: AdminApiOptions = {}) {
  const token = getAdminToken().trim();
  if (!token) {
    redirectToLogin();
    throw new Error("SESSION_EXPIRED");
  }

  try {
    return await apiRequest<T>(path, { ...options, token });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    if (SESSION_ERROR_SET.has(raw)) {
      redirectToLogin();
    }
    throw error;
  }
}
