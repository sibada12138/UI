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

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
};

export async function apiRequest<T>(path: string, options: ApiOptions = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const requestUrl = `${resolveApiBase()}${path}`;
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new Error('NETWORK_ERROR');
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as T & { message?: string })
    : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : response.statusText) || 'REQUEST_FAILED';
    throw new Error(message);
  }

  return payload as T;
}
