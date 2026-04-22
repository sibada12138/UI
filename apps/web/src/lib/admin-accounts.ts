import { adminApiRequest } from "@/lib/admin-api";

export type AdminAccountItem = {
  id: string;
  taskId: string | null;
  token: string;
  phone: string;
  phoneMasked: string;
  smsCode: string;
  accessToken: string;
  cookie: string;
  externalUid: string | null;
  submittedAt: string;
  updatedAt: string;
  status: string;
  hasUserVip: boolean;
  hasWinkVip: boolean;
  vipFetchedAt: string | null;
};

type LegacyTaskItem = {
  id: string;
  token?: string;
  phone?: string;
  phoneMasked?: string;
  smsCode?: string;
  status?: string;
  submittedAt?: string;
  updatedAt?: string;
  externalUid?: string | null;
  hasUserVip?: boolean;
  hasWinkVip?: boolean;
  vipFetchedAt?: string | null;
  accessToken?: string;
  cookie?: string;
};

function isAccountsRouteMissing(error: unknown) {
  const message = (error instanceof Error ? error.message : "").toLowerCase();
  if (!message) {
    return false;
  }
  return (
    message.includes("cannot get") ||
    message.includes("not found") ||
    message.includes("404")
  );
}

function mapLegacyTaskToAccount(item: LegacyTaskItem): AdminAccountItem {
  const submittedAt = item.submittedAt || item.updatedAt || new Date().toISOString();
  const updatedAt = item.updatedAt || submittedAt;
  return {
    id: item.id,
    taskId: item.id,
    token: String(item.token ?? ""),
    phone: String(item.phone ?? ""),
    phoneMasked: String(item.phoneMasked ?? item.phone ?? ""),
    smsCode: String(item.smsCode ?? ""),
    accessToken: String(item.accessToken ?? ""),
    cookie: String(item.cookie ?? ""),
    externalUid: item.externalUid ?? null,
    submittedAt,
    updatedAt,
    status: String(item.status ?? "pending"),
    hasUserVip: Boolean(item.hasUserVip),
    hasWinkVip: Boolean(item.hasWinkVip),
    vipFetchedAt: item.vipFetchedAt ?? null,
  };
}

export async function fetchAdminAccounts() {
  try {
    const data = await adminApiRequest<{ items: AdminAccountItem[] }>(
      "/admin/recharge/tasks/accounts",
    );
    return data.items || [];
  } catch (error) {
    if (!isAccountsRouteMissing(error)) {
      throw error;
    }
    const fallback = await adminApiRequest<{ items: LegacyTaskItem[] }>(
      "/admin/recharge/tasks",
    );
    return (fallback.items || []).map((item) => mapLegacyTaskToAccount(item));
  }
}
