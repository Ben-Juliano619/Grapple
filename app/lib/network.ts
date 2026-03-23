const DEV_BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || "3001";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getBrowserBackendOrigin() {
  if (typeof window === "undefined") return "";

  const { protocol, hostname, port, origin } = window.location;
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev && port !== DEV_BACKEND_PORT) {
    return `${protocol}//${hostname}:${DEV_BACKEND_PORT}`;
  }

  return origin;
}

function readPublicUrl(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return trimTrailingSlash(normalized);
}

export function resolveApiBaseUrl() {
  const fromEnv = readPublicUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (fromEnv) return fromEnv;
  return getBrowserBackendOrigin();
}

export function resolveSocketUrl() {
  const fromEnv = readPublicUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  if (fromEnv) return fromEnv;
  return resolveApiBaseUrl();
}

export function getApiUrl(path: string) {
  const base = resolveApiBaseUrl();
  if (!base) return path;
  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}
