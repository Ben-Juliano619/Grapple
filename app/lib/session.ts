const COOKIE_NAME = "grapple.sessionId";
const COOKIE_MAX_AGE_SECONDS = 31536000;

export type GameSessionCookie = {
  gameId: string;
  sessionId: string;
};

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
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

function parseCookieValue(value: string): GameSessionCookie | null {
  try {
    const parsed = JSON.parse(value) as Partial<GameSessionCookie>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.gameId !== "string" || typeof parsed.sessionId !== "string") return null;
    if (!parsed.gameId.trim() || !parsed.sessionId.trim()) return null;
    return { gameId: parsed.gameId.trim(), sessionId: parsed.sessionId.trim() };
  } catch {
    return null;
  }
}

export function readGameSessionCookie(): GameSessionCookie | null {
  const raw = readCookie(COOKIE_NAME);
  if (!raw) return null;
  return parseCookieValue(raw);
}

export function writeGameSessionCookie(session: GameSessionCookie) {
  writeCookie(COOKIE_NAME, JSON.stringify(session));
}

export function clearGameSessionCookie() {
  deleteCookie(COOKIE_NAME);
}

export function createNewGameSession(gameId: string): GameSessionCookie {
  const generated = createSessionId();
  const next = { gameId, sessionId: generated };
  writeGameSessionCookie(next);
  return next;
}

export function ensureSessionForGame(gameId: string) {
  const existing = readGameSessionCookie();
  if (existing?.gameId === gameId) return existing.sessionId;
  return createNewGameSession(gameId).sessionId;
}
