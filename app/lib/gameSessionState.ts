import { clearGameSessionCookie } from "./session";
import { resetSocket } from "./socket";

const ACTIVE_GAME_ID_KEY = "grapple.activeGameId";

type ResetOptions = {
  clearSessionCookie?: boolean;
  resetSocketConnection?: () => void;
};

export function setActiveGameId(gameId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ACTIVE_GAME_ID_KEY, gameId);
}

export function clearActiveGameId() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ACTIVE_GAME_ID_KEY);
}

export function getActiveGameId() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ACTIVE_GAME_ID_KEY);
}

export function resetGameSessionState(options: ResetOptions = {}) {
  const { clearSessionCookie = false, resetSocketConnection = resetSocket } = options;

  resetSocketConnection();
  clearActiveGameId();

  if (clearSessionCookie) {
    clearGameSessionCookie();
  }
}
