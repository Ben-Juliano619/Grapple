// app/lib/socket.ts
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function resolveSocketUrl() {
  const localSocketUrl = "http://localhost:3001";
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
  }
  return socket;
}

export function resetSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
