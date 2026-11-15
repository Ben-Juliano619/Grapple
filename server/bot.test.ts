import test from "node:test";
import assert from "node:assert/strict";
import { createGameState, type GameState } from "./logic";
import { takeBotTurn } from "./bot";

function addPlayer(state: GameState, id: string) {
  state.players.push({
    id,
    name: id,
    hand: [],
    score: 0,
    penaltyPoints: 0,
    currentPosition: "NEUTRAL",
    previousPosition: undefined,
    canCounterTakedown: false,
  });
}

function playBotVsBot(mode: GameState["gameMode"]) {
  const state = createGameState("test");
  state.gameMode = mode;
  addPlayer(state, "a");
  addPlayer(state, "b");
  state.start();

  for (let step = 0; step < 2000 && state.phase !== "ENDED"; step += 1) {
    const moved = takeBotTurn(state, "a") || takeBotTurn(state, "b");
    if (!moved) break;
  }
  return state;
}

test("two bots can finish a classic game", () => {
  for (let i = 0; i < 50; i += 1) {
    const state = playBotVsBot("CLASSIC");
    // A game can also stall legitimately when the draw pile runs out.
    assert.ok(state.phase === "ENDED" || state.drawPile.length === 0, `stuck in phase ${state.phase}`);
  }
});

test("two bots can finish a three-round game", () => {
  for (let i = 0; i < 50; i += 1) {
    const state = playBotVsBot("THREE_ROUND");
    assert.ok(state.phase === "ENDED" || state.drawPile.length === 0, `stuck in phase ${state.phase}`);
  }
});

test("bot does nothing when it is not its turn", () => {
  const state = createGameState("test");
  addPlayer(state, "a");
  addPlayer(state, "b");
  state.start();
  const notBot = state.players[state.currentTurnIndex].id === "a" ? "b" : "a";
  assert.equal(takeBotTurn(state, notBot), false);
});
