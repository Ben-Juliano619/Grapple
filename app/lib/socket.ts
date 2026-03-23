import { io, type Socket } from "socket.io-client";
import { resolveSocketUrl } from "./network";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    const socketUrl = resolveSocketUrl();
    console.info(`[socket] Connecting to ${socketUrl || "same-origin"}`);
    socket = io(socketUrl, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 250,
      reconnectionDelayMax: 2000,
      withCredentials: true,
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
