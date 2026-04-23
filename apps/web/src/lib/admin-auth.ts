const TOKEN_KEY = 'admin_access_token';
const COOKIE_KEY = 'admin_auth';
const TOKEN_COOKIE_KEY = 'admin_access_token';
const PROFILE_KEY = 'admin_profile';
let memoryToken = '';
let lastGetSnapshot = '';

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

function logAuthDebug(message: string, payload?: Record<string, unknown>) {
  if (typeof window === 'undefined') {
    return;
  }
  if (payload) {
    console.info('[AUTH_DEBUG][admin-auth]', message, payload);
    return;
  }
  console.info('[AUTH_DEBUG][admin-auth]', message);
}

export type AdminProfile = {
  id?: string;
  username: string;
  role?: string;
};

function getCookieValue(name: string) {
  if (typeof document === 'undefined') {
    return '';
  }
  const hit = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!hit) {
    return '';
  }
  return decodeURIComponent(hit.slice(name.length + 1));
}

export function hasAdminSessionCookie() {
  return getCookieValue(COOKIE_KEY) === '1' || getCookieValue(TOKEN_COOKIE_KEY).trim().length > 0;
}

export function getAdminToken() {
  if (memoryToken.trim()) {
    const snapshot = `memory:${maskToken(memoryToken)}`;
    if (lastGetSnapshot !== snapshot) {
      lastGetSnapshot = snapshot;
      logAuthDebug('getAdminToken from memory', { token: maskToken(memoryToken) });
    }
    return memoryToken;
  }
  if (typeof window === 'undefined') {
    return '';
  }
  let local = '';
  try {
    local = window.localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    local = '';
  }
  if (local.trim()) {
    memoryToken = local;
    const snapshot = `local:${maskToken(local)}`;
    if (lastGetSnapshot !== snapshot) {
      lastGetSnapshot = snapshot;
      logAuthDebug('getAdminToken from localStorage', { token: maskToken(local) });
    }
    return local;
  }
  const cookieToken = getCookieValue(TOKEN_COOKIE_KEY);
  if (cookieToken.trim()) {
    memoryToken = cookieToken;
    const snapshot = `cookie:${maskToken(cookieToken)}`;
    if (lastGetSnapshot !== snapshot) {
      lastGetSnapshot = snapshot;
      logAuthDebug('getAdminToken from cookie', { token: maskToken(cookieToken) });
    }
    return cookieToken;
  }
  if (lastGetSnapshot !== 'empty') {
    lastGetSnapshot = 'empty';
    logAuthDebug('getAdminToken empty');
  }
  return cookieToken;
}

export function saveAdminToken(token: string) {
  const normalized = String(token ?? '').trim();
  if (!normalized) {
    logAuthDebug('saveAdminToken skipped because token is empty');
    return;
  }
  memoryToken = normalized;
  lastGetSnapshot = '';
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(TOKEN_KEY, normalized);
  } catch {
    // ignore localStorage write errors
  }
  document.cookie = `${TOKEN_COOKIE_KEY}=${encodeURIComponent(normalized)}; Path=/; Max-Age=43200; SameSite=Lax`;
  document.cookie = `${COOKIE_KEY}=1; Path=/; Max-Age=43200; SameSite=Lax`;
  logAuthDebug('saveAdminToken completed', {
    token: maskToken(normalized),
    cookieLength: document.cookie.length,
  });
}

export function getAdminProfile(): AdminProfile | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AdminProfile;
    if (!parsed || typeof parsed.username !== 'string' || !parsed.username.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdminProfile(profile: AdminProfile) {
  if (typeof window === 'undefined') {
    return;
  }
  if (!profile?.username?.trim()) {
    return;
  }
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearAdminToken() {
  logAuthDebug('clearAdminToken called', { tokenBeforeClear: maskToken(memoryToken) });
  memoryToken = '';
  lastGetSnapshot = '';
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(PROFILE_KEY);
  } catch {
    // ignore localStorage clear errors
  }
  document.cookie = `${TOKEN_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}
