const TOKEN_KEY = 'admin_access_token';
const COOKIE_KEY = 'admin_auth';
const TOKEN_COOKIE_KEY = 'admin_access_token';

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

export function getAdminToken() {
  if (typeof window === 'undefined') {
    return '';
  }
  const local = window.localStorage.getItem(TOKEN_KEY) ?? '';
  if (local.trim()) {
    return local;
  }
  return getCookieValue(TOKEN_COOKIE_KEY);
}

export function saveAdminToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=43200; SameSite=Lax`;
  document.cookie = `${COOKIE_KEY}=1; Path=/; Max-Age=43200; SameSite=Lax`;
}

export function clearAdminToken() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}
