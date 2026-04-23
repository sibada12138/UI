const RAW_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

function resolveApiBase() {
  if (typeof window === 'undefined') {
    return RAW_API_BASE;
  }

  const base = RAW_API_BASE.trim();
  if (!base) {
    return '/api';
  }
  if (base.startsWith('/')) {
    return base;
  }

  try {
    const parsed = new URL(base);
    // Browser-side requests to localhost on a remote site are always wrong.
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      return '/api';
    }
  } catch {
    return '/api';
  }

  return base;
}

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
};

function maskToken(token: string) {
  const value = String(token ?? '').trim();
  if (!value) {
    return '(empty)';
  }
  if (value.length <= 12) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function logApiDebug(message: string, payload?: Record<string, unknown>) {
  if (typeof window === 'undefined') {
    return;
  }
  if (payload) {
    console.info('[AUTH_DEBUG][api]', message, payload);
    return;
  }
  console.info('[AUTH_DEBUG][api]', message);
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
    headers["X-Admin-Token"] = options.token;
  }

  const requestUrl = `${resolveApiBase()}${path}`;
  logApiDebug('request', {
    path,
    url: requestUrl,
    method: options.method ?? 'GET',
    hasToken: Boolean(options.token),
    token: maskToken(options.token ?? ''),
  });
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (error) {
    logApiDebug('network error', {
      path,
      url: requestUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('NETWORK_ERROR');
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as T & { message?: string })
    : null;

  logApiDebug('response', {
    path,
    url: requestUrl,
    status: response.status,
    ok: response.ok,
    message:
      payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : '',
  });

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : response.statusText) || 'REQUEST_FAILED';
    throw new Error(message);
  }

  return payload as T;
}
