export type GameSessionState = {
  sessionToPlayerId: Map<string, string>;
  connectedSocketIds: Set<string>;
  createdAt: number;
  emptySince: number | null;
};

export const GAME_IDLE_TTL_MS = 2 * 60 * 1000;
export const GAME_MAX_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 30 * 1000;

export function createGameSessionState(now: number): GameSessionState {
  return {
    sessionToPlayerId: new Map(),
    connectedSocketIds: new Set(),
    createdAt: now,
    emptySince: now,
  };
}

export function markConnected(sessionState: GameSessionState, socketId: string) {
  sessionState.connectedSocketIds.add(socketId);
  sessionState.emptySince = null;
}

export function markDisconnected(sessionState: GameSessionState, socketId: string, now: number) {
  sessionState.connectedSocketIds.delete(socketId);
  if (sessionState.connectedSocketIds.size === 0) {
    sessionState.emptySince = now;
  }
}

export function shouldCleanupGame(sessionState: GameSessionState, now: number) {
  const lifetimeExpired = now - sessionState.createdAt > GAME_MAX_LIFETIME_MS;
  const idleExpired = sessionState.emptySince !== null && now - sessionState.emptySince > GAME_IDLE_TTL_MS;
  return lifetimeExpired || idleExpired;
}
