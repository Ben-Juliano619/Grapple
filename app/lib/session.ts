const COOKIE_NAME = "grapple.sessionId";

function getCrypto() {
  if (typeof globalThis === "undefined") return null;
  return globalThis.crypto ?? null;
}

function createSessionId() {
  const cryptoApi = getCrypto();

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }

  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2);
  return `${timestamp}-${random}`;
}

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

  const generated = createSessionId();
  writeCookie(COOKIE_NAME, generated);
  return generated;
}

export function rotateSessionId() {
  const generated = createSessionId();
  writeCookie(COOKIE_NAME, generated);
  return generated;
}
