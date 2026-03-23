import test from "node:test";
import assert from "node:assert/strict";
import {
  createGameSessionState,
  GAME_IDLE_TTL_MS,
  GAME_MAX_LIFETIME_MS,
  markConnected,
  markDisconnected,
  shouldCleanupGame,
} from "./sessionLifecycle";

test("does not cleanup an active game within lifetime", () => {
  const now = Date.now();
  const sessionState = createGameSessionState(now);
  markConnected(sessionState, "socket-1");

  assert.equal(shouldCleanupGame(sessionState, now + 30_000), false);
});

test("cleans up game after idle timeout once all players disconnect", () => {
  const now = Date.now();
  const sessionState = createGameSessionState(now);
  markConnected(sessionState, "socket-1");
  markDisconnected(sessionState, "socket-1", now + 1_000);

  assert.equal(shouldCleanupGame(sessionState, now + 1_000 + GAME_IDLE_TTL_MS - 1), false);
  assert.equal(shouldCleanupGame(sessionState, now + 1_000 + GAME_IDLE_TTL_MS + 1), true);
});

test("cleans up game after max lifetime even if connected", () => {
  const now = Date.now();
  const sessionState = createGameSessionState(now);
  markConnected(sessionState, "socket-1");

  assert.equal(shouldCleanupGame(sessionState, now + GAME_MAX_LIFETIME_MS - 1), false);
  assert.equal(shouldCleanupGame(sessionState, now + GAME_MAX_LIFETIME_MS + 1), true);
});
