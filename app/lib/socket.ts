// app/lib/socket.ts
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let hasResumeListener = false;

export function resolveSocketUrl() {
  // In dev, reach the socket server on whatever host served the page, so a
  // phone on the same Wi-Fi (http://192.168.x.x:3000) talks to the PC's :3001
  // instead of its own localhost.
  const localSocketUrl =
    typeof window !== "undefined" && window.location.hostname && window.location.protocol.startsWith("http")
      ? `http://${window.location.hostname}:3001`
      : "http://localhost:3001";
  const productionFallbackUrl = "https://grapplewrestlingcardgame.com";
  const useLocalSocket = process.env.NEXT_PUBLIC_USE_LOCAL_SOCKET === "true";
  const isProduction = process.env.NODE_ENV === "production";

  if (useLocalSocket) return localSocketUrl;
  if (!isProduction) return localSocketUrl;
  return process.env.NEXT_PUBLIC_SOCKET_URL || productionFallbackUrl;
}

export function getSocket() {
  if (!socket) {
    const socketUrl = resolveSocketUrl();
    console.info(`[socket] Connecting to ${socketUrl}`);
    socket = io(socketUrl, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 250,
      reconnectionDelayMax: 2000,
    });

    // When the app comes back to the foreground (iOS suspends it in the
    // background), reconnect right away instead of waiting for a timeout.
    if (typeof document !== "undefined" && !hasResumeListener) {
      hasResumeListener = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && socket && !socket.connected) {
          socket.connect();
        }
      });
    }
  }
  return socket;
}

export function resetSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
