const DEFAULT_SERVER_PORT = "3001";

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function readPublicEnv(name: "NEXT_PUBLIC_API_BASE_URL" | "NEXT_PUBLIC_SOCKET_URL") {
  const value = process.env[name]?.trim();
  return value ? trimTrailingSlash(value) : "";
}

function browserOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function browserHost() {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

function inferDevServerOrigin() {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;

  // In local development Next commonly runs on :3000 while the API/socket server runs on :3001.
  if (port === "3000") {
    return `${protocol}//${hostname}:${DEFAULT_SERVER_PORT}`;
  }

  return browserOrigin();
}

export function resolveApiBaseUrl() {
  const envUrl = readPublicEnv("NEXT_PUBLIC_API_BASE_URL");
  if (envUrl) return envUrl;

  const inferred = inferDevServerOrigin();
  if (inferred) return inferred;

  return "";
}

export function resolveSocketUrl() {
  const socketEnvUrl = readPublicEnv("NEXT_PUBLIC_SOCKET_URL");
  if (socketEnvUrl) return socketEnvUrl;

  const apiEnvUrl = readPublicEnv("NEXT_PUBLIC_API_BASE_URL");
  if (apiEnvUrl) return apiEnvUrl;

  const inferred = inferDevServerOrigin();
  if (inferred) return inferred;

  const origin = browserOrigin();
  if (origin) return origin;

  const host = browserHost();
  if (host) return `http://${host}:${DEFAULT_SERVER_PORT}`;

  return "http://127.0.0.1:3001";
}

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = resolveApiBaseUrl();
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}
