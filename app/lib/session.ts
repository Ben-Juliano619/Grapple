const COOKIE_NAME = "grapple.sessionId";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!cookie) return null;
  return decodeURIComponent(cookie.slice(prefix.length));
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

export function getOrCreateSessionId() {
  const fromCookie = readCookie(COOKIE_NAME);
  if (fromCookie) return fromCookie;

  const generated = crypto.randomUUID();
  writeCookie(COOKIE_NAME, generated);
  return generated;
}
