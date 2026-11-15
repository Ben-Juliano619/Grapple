// Rule-by-rule tests against the printed rules cards (public/img/cards/rules1-3.png)
// and the card faces.
import test from "node:test";
import assert from "node:assert/strict";
import type { Position } from "../shared/types";
import { applyAction, createGameState, tickRoundTimer, type GameState } from "./logic";
import { takeBotTurn } from "./bot";

const A = "a";
const B = "b";

function newGame(mode: GameState["gameMode"] = "CLASSIC") {
  const state = createGameState("test");
  state.gameMode = mode;
  for (const id of [A, B]) {
    state.players.push({ id, name: id, hand: [], score: 0, penaltyPoints: 0, currentPosition: "NEUTRAL", canCounterTakedown: false });
  }
  state.start();
  return state;
}

/** Put every dealt card back in the draw pile so tests pick exact hands. */
function clearHands(state: GameState) {
  for (const p of state.players) {
    state.drawPile.push(...p.hand);
    p.hand = [];
  }
}

/** A game already past the opening, with empty hands, A to move. */
function midGame(positions: { a: Position; b: Position } = { a: "NEUTRAL", b: "NEUTRAL" }) {
  const state = newGame();
  state.phase = "PLAY";
  state.currentTurnIndex = 0;
  clearHands(state);
  player(state, A).currentPosition = positions.a;
  player(state, B).currentPosition = positions.b;
  return state;
}

function player(state: GameState, id: string) {
  return state.players.find((p) => p.id === id)!;
}

/** Move a specific card (by image file) from the draw pile into a hand. */
function give(state: GameState, id: string, imageFile: string) {
  let pile = state.drawPile;
  let index = pile.findIndex((card) => card.imageFile === imageFile);
  if (index < 0) {
    pile = state.playedPile;
    index = pile.findIndex((card) => card.imageFile === imageFile);
  }
  assert.ok(index >= 0, `no ${imageFile} left to give`);
  const [card] = pile.splice(index, 1);
  player(state, id).hand.push(card);
  return card;
}

function play(state: GameState, id: string, imageFile: string) {
  const card = player(state, id).hand.find((c) => c.imageFile === imageFile) ?? give(state, id, imageFile);
  return applyAction(state, { type: "PLAY_CARD", playerId: id, cardId: card.id });
}

/** Give both players a spare card so playing one card never empties a hand (which wins). */
function padHands(state: GameState) {
  give(state, A, "stalling.png");
  give(state, B, "stalling.png");
}

const positions = (state: GameState) => ({ a: player(state, A).currentPosition, b: player(state, B).currentPosition });
const turn = (state: GameState) => state.players[state.currentTurnIndex].id;

// ---------- How to play: the opening ----------

test("deal: 5 cards each, both neutral, waiting for a Neutral card", () => {
  const state = newGame();
  assert.equal(state.phase, "FIND_START_NEUTRAL");
  for (const p of state.players) {
    assert.equal(p.hand.length, 5);
    assert.equal(p.currentPosition, "NEUTRAL");
  }
  assert.equal(state.drawPile.length, 50 - 10);
});

test("opening: only a Neutral card can be played; drawing loses the turn", () => {
  const state = newGame();
  const first = turn(state);
  clearHands(state);
  give(state, first, "top_far_arm_chop.png");
  assert.equal(play(state, first, "top_far_arm_chop.png").ok, false);

  assert.ok(applyAction(state, { type: "DRAW", playerId: first }).ok);
  assert.notEqual(turn(state), first, "drawing ends the turn (you can't play the drawn card)");
  assert.equal(player(state, first).hand.length, 2);
});

test("opening Neutral card starts the match", () => {
  const state = newGame();
  const first = turn(state);
  clearHands(state);
  padHands(state);
  assert.ok(play(state, first, "neutral_single_leg_takedown.png").ok);
  assert.equal(state.phase, "PLAY");
});

// ---------- Takedowns, attempted takedowns and counters ----------

for (const card of [
  "neutral_single_leg_takedown.png",
  "neutral_double_leg_takedown.png",
  "neutral_duck_under_takedown.png",
  "neutral_hip_toss_takedown.png",
  "neutral_ankle_pick_to_back.png",
  "neutral_firemans_carry_to_opponents_back.png",
]) {
  test(`takedown (${card}): attacker on top, opponent on bottom`, () => {
    const state = midGame();
    padHands(state);
    assert.ok(play(state, A, card).ok);
    assert.deepEqual(positions(state), { a: "TOP", b: "BOTTOM" });
    assert.equal(turn(state), B);
  });
}

test("attempted takedown: no change of position, still neutral", () => {
  const state = midGame();
  padHands(state);
  assert.ok(play(state, A, "neutral_attempted_takedown.png").ok);
  assert.deepEqual(positions(state), { a: "NEUTRAL", b: "NEUTRAL" });
});

test("counter right after a takedown returns both wrestlers to neutral", () => {
  const state = midGame();
  padHands(state);
  play(state, A, "neutral_double_leg_takedown.png");
  assert.ok(play(state, B, "counter_sprawl.png").ok);
  assert.deepEqual(positions(state), { a: "NEUTRAL", b: "NEUTRAL" });
});

test("counter is only allowed immediately after a takedown", () => {
  const state = midGame({ a: "BOTTOM", b: "TOP" });
  padHands(state);
  assert.equal(play(state, A, "counter_whizzer.png").ok, false);
});

// ---------- Position rules ----------

test("you can't throw a Neutral card from Top or Bottom", () => {
  const state = midGame({ a: "TOP", b: "BOTTOM" });
  assert.equal(play(state, A, "neutral_single_leg_takedown.png").ok, false);
  const other = midGame({ a: "BOTTOM", b: "TOP" });
  assert.equal(play(other, A, "neutral_single_leg_takedown.png").ok, false);
});

test("Top cards only from Top, Bottom cards only from Bottom", () => {
  assert.equal(play(midGame({ a: "BOTTOM", b: "TOP" }), A, "top_far_arm_chop.png").ok, false);
  assert.equal(play(midGame({ a: "TOP", b: "BOTTOM" }), A, "bottom_stand_up.png").ok, false);
  assert.equal(play(midGame(), A, "top_far_arm_chop.png").ok, false);
});

test("Top ride/breakdown keeps the top wrestler in control", () => {
  const state = midGame({ a: "TOP", b: "BOTTOM" });
  padHands(state);
  assert.ok(play(state, A, "top_spiral_ride_to_opponents_back.png").ok);
  assert.deepEqual(positions(state), { a: "TOP", b: "BOTTOM" });
});

test("stand up (Escape E1): both back to neutral", () => {
  const state = midGame({ a: "BOTTOM", b: "TOP" });
  padHands(state);
  assert.ok(play(state, A, "bottom_stand_up.png").ok);
  assert.deepEqual(positions(state), { a: "NEUTRAL", b: "NEUTRAL" });
});

for (const card of ["bottom_granby_roll.png", "bottom_inside_switch.png", "bottom_outside_switch.png"]) {
  test(`reversal (${card}): bottom wrestler comes out on top`, () => {
    const state = midGame({ a: "BOTTOM", b: "TOP" });
    padHands(state);
    assert.ok(play(state, A, card).ok);
    assert.deepEqual(positions(state), { a: "TOP", b: "BOTTOM" });
  });
}

for (const card of ["bottom_sit_out_no_change_of_position.png", "bottom_sit_out_tripod_duckout.png", "bottom_sit_out_tripod_peterson.png"]) {
  test(`tripod/sit out (${card}): no change of position, top stays in control`, () => {
    const state = midGame({ a: "BOTTOM", b: "TOP" });
    padHands(state);
    assert.ok(play(state, A, card).ok);
    assert.deepEqual(positions(state), { a: "BOTTOM", b: "TOP" });
  });
}

// ---------- Special cards ----------

test("Blood Time: opponent loses a turn", () => {
  const state = midGame();
  padHands(state);
  assert.ok(play(state, A, "blood_time.png").ok);
  assert.equal(turn(state), A);
});

test("Penalty: next player loses a turn and gets 1 penalty point", () => {
  const state = midGame();
  padHands(state);
  assert.ok(play(state, A, "penalty.png").ok);
  assert.equal(turn(state), A);
  assert.equal(player(state, B).penaltyPoints, 1);
});

test("Stalling: previous position is maintained, turn passes", () => {
  const state = midGame({ a: "TOP", b: "BOTTOM" });
  padHands(state);
  give(state, A, "blood_time.png");
  assert.ok(play(state, A, "stalling.png").ok);
  assert.deepEqual(positions(state), { a: "TOP", b: "BOTTOM" });
  assert.equal(turn(state), B);
});

test("Out of Bounds: both wrestlers go back to the previous position", () => {
  const state = midGame();
  padHands(state);
  play(state, A, "neutral_double_leg_takedown.png");
  assert.deepEqual(positions(state), { a: "TOP", b: "BOTTOM" });
  assert.ok(play(state, B, "out_of_bounds.png").ok);
  assert.deepEqual(positions(state), { a: "NEUTRAL", b: "NEUTRAL" });
});

test("Out of Bounds with no earlier position change leaves positions alone", () => {
  const state = midGame({ a: "TOP", b: "BOTTOM" });
  padHands(state);
  assert.ok(play(state, A, "out_of_bounds.png").ok);
  assert.deepEqual(positions(state), { a: "TOP", b: "BOTTOM" });
});

test("End of Period: player who played it picks the position", () => {
  const state = midGame({ a: "TOP", b: "BOTTOM" });
  padHands(state);
  assert.ok(play(state, B, "end_of_period.png").ok === false, "not B's turn");
  state.currentTurnIndex = 1;
  assert.ok(play(state, B, "end_of_period.png").ok);
  assert.equal(state.pendingEndOfPeriodPlayerId, B);
  assert.ok(applyAction(state, { type: "END_OF_PERIOD_POSITION", playerId: B, position: "TOP" }).ok);
  assert.deepEqual(positions(state), { a: "BOTTOM", b: "TOP" });
  assert.equal(turn(state), A);
});

test("Blood Time / Penalty / End of Period can be played from any position", () => {
  for (const card of ["blood_time.png", "penalty.png", "end_of_period.png", "stalling.png", "out_of_bounds.png"]) {
    for (const pos of ["NEUTRAL", "TOP", "BOTTOM"] as const) {
      const other: Position = pos === "TOP" ? "BOTTOM" : pos === "BOTTOM" ? "TOP" : "NEUTRAL";
      const state = midGame({ a: pos, b: other });
      padHands(state);
      assert.ok(play(state, A, card).ok, `${card} from ${pos}`);
    }
  }
});

// ---------- Winning ----------

test("a Pin card wins immediately (from the matching position only)", () => {
  assert.equal(play(midGame(), A, "top_turk_craddle_to_pin.png").ok, false);

  const top = midGame({ a: "TOP", b: "BOTTOM" });
  padHands(top);
  assert.ok(play(top, A, "top_turk_craddle_to_pin.png").ok);
  assert.equal(top.phase, "ENDED");
  assert.equal(top.gameWinnerPlayerId, A);

  const bottom = midGame({ a: "BOTTOM", b: "TOP" });
  padHands(bottom);
  assert.ok(play(bottom, A, "bottom_elbow_roll_chest_to_chest_pin.png").ok);
  assert.equal(bottom.gameWinnerPlayerId, A);

  const neutral = midGame();
  padHands(neutral);
  assert.ok(play(neutral, A, "neutral_head_lock_to_pin.png").ok);
  assert.equal(neutral.gameWinnerPlayerId, A);
});

test("getting rid of all your cards wins", () => {
  const state = midGame();
  give(state, B, "stalling.png");
  give(state, A, "neutral_single_leg_takedown.png");
  assert.ok(play(state, A, "neutral_single_leg_takedown.png").ok);
  assert.equal(state.phase, "ENDED");
  assert.equal(state.gameWinnerPlayerId, A);
});

test("rematch: the loser plays first", () => {
  const state = midGame({ a: "TOP", b: "BOTTOM" });
  padHands(state);
  play(state, A, "top_turk_craddle_to_pin.png");
  applyAction(state, { type: "REQUEST_REMATCH", playerId: A });
  applyAction(state, { type: "REQUEST_REMATCH", playerId: B });
  assert.equal(state.phase, "LOBBY");
  state.start();
  assert.equal(turn(state), B);
});

// ---------- Drawing ----------

test("you can only draw when nothing in your hand is playable", () => {
  const state = midGame();
  padHands(state); // stalling is playable from anywhere
  const result = applyAction(state, { type: "DRAW", playerId: A });
  assert.equal(result.ok, false);
  assert.equal(turn(state), A);
});

test("drawing is allowed when nothing is playable, and the drawn card can't be played this turn", () => {
  const state = midGame({ a: "BOTTOM", b: "TOP" });
  give(state, A, "top_far_arm_chop.png");
  const before = player(state, A).hand.length;
  assert.ok(applyAction(state, { type: "DRAW", playerId: A }).ok);
  assert.equal(player(state, A).hand.length, before + 1);
  assert.equal(turn(state), B);
});

test("safety net: nothing playable and nothing to draw passes the turn", () => {
  const state = midGame({ a: "BOTTOM", b: "TOP" });
  give(state, A, "top_far_arm_chop.png");
  state.drawPile = [];
  state.playedPile = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.ok(applyAction(state, { type: "DRAW", playerId: A }).ok);
  } finally {
    console.warn = warn;
  }
  assert.equal(turn(state), B);
  assert.equal(player(state, A).hand.length, 1);
});

test("an empty draw pile is refilled from the used pile", () => {
  const state = midGame({ a: "BOTTOM", b: "TOP" });
  give(state, A, "top_far_arm_chop.png");
  state.playedPile.push(...state.drawPile);
  state.drawPile = [];
  assert.ok(applyAction(state, { type: "DRAW", playerId: A }).ok);
  assert.equal(player(state, A).hand.length, 2);
  assert.ok(state.drawPile.length > 0);
});

// ---------- 3 Rounds mode ----------

/** Make any pending round-start choices the way players would. */
function makeRoundChoices(state: GameState) {
  if (state.pendingRound2DecisionPlayerId) {
    applyAction(state, { type: "ROUND2_DECISION", playerId: state.pendingRound2DecisionPlayerId, deferStartChoice: false });
  }
  const chooser = state.pendingRound2StartPositionChooserPlayerId ?? state.pendingRound3StartPositionChooserPlayerId;
  if (chooser) applyAction(state, { type: "ROUND_START_POSITION", playerId: chooser, position: "NEUTRAL" });
}

function endRoundByTimer(state: GameState) {
  makeRoundChoices(state);
  state.roundEndsAt = Date.now() - 1;
  assert.ok(tickRoundTimer(state));
}

/** 3 Rounds game in round 1, past the opening, empty hands, A to move. */
function threeRounds() {
  const state = newGame("THREE_ROUND");
  state.phase = "PLAY";
  state.currentTurnIndex = 0;
  clearHands(state);
  return state;
}

test("3 Rounds: a pin wins the round only, not the match", () => {
  const state = threeRounds();
  padHands(state);
  assert.ok(play(state, A, "neutral_head_lock_to_pin.png").ok);
  assert.equal(state.roundWins[A], 1);
  assert.equal(state.currentRound, 2);
  assert.notEqual(state.phase, "ENDED");
});

test("3 Rounds: emptying your hand wins the round", () => {
  const state = threeRounds();
  give(state, B, "stalling.png");
  give(state, A, "neutral_single_leg_takedown.png");
  assert.ok(play(state, A, "neutral_single_leg_takedown.png").ok);
  assert.equal(state.roundWins[A], 1);
  assert.equal(state.currentRound, 2);
});

test("3 Rounds: End of Period ends the round as a draw", () => {
  const state = threeRounds();
  padHands(state);
  assert.ok(play(state, A, "end_of_period.png").ok);
  assert.equal(state.roundWins[A], 0);
  assert.equal(state.roundWins[B], 0);
  assert.equal(state.currentRound, 2);
});

test("3 Rounds: the period timer running out is a draw", () => {
  const state = threeRounds();
  state.roundEndsAt = Date.now() - 1;
  assert.ok(tickRoundTimer(state));
  assert.equal(state.currentRound, 2);
  assert.equal((state.roundWins[A] ?? 0) + (state.roundWins[B] ?? 0), 0);
});

test("3 Rounds: next period deals new hands from the same deck (no reshuffle)", () => {
  const state = threeRounds();
  padHands(state);
  const drawPileBefore = state.drawPile.length;
  const oldHandIds = new Set(state.players.flatMap((p) => p.hand.map((c) => c.id)));
  play(state, A, "end_of_period.png"); // round 1 ends as a draw
  for (const p of state.players) {
    assert.equal(p.hand.length, 5);
    assert.ok(p.hand.every((c) => !oldHandIds.has(c.id)), "new hands");
  }
  assert.equal(state.drawPile.length, drawPileBefore - 1 - 10, "dealt from the remaining draw pile");
});

test("3 Rounds: two round wins take the match", () => {
  const state = threeRounds();
  padHands(state);
  play(state, A, "neutral_head_lock_to_pin.png");
  makeRoundChoices(state);
  state.currentTurnIndex = 0;
  clearHands(state);
  padHands(state);
  for (const p of state.players) p.currentPosition = "NEUTRAL";
  assert.ok(play(state, A, "neutral_head_lock_to_pin.png").ok);
  assert.equal(state.phase, "ENDED");
  assert.equal(state.gameWinnerPlayerId, A);
});

test("3 Rounds: tied after 3 rounds goes to a 1-minute overtime", () => {
  const state = threeRounds();
  for (let round = 1; round <= 3; round += 1) endRoundByTimer(state);
  assert.equal(state.isOvertime, true);
  assert.equal(state.phase, "PLAY");
  const remaining = (state.roundEndsAt ?? 0) - Date.now();
  assert.ok(remaining > 55_000 && remaining <= 60_000, `overtime timer ${remaining}ms`);
});

test("overtime: a pin wins the match; time running out is a draw", () => {
  const toOvertime = () => {
    const state = threeRounds();
    for (let round = 1; round <= 3; round += 1) endRoundByTimer(state);
    state.currentTurnIndex = 0;
    clearHands(state);
    return state;
  };

  const pinned = toOvertime();
  padHands(pinned);
  assert.ok(play(pinned, A, "neutral_head_lock_to_pin.png").ok);
  assert.equal(pinned.phase, "ENDED");
  assert.equal(pinned.gameResult, "WIN");
  assert.equal(pinned.gameWinnerPlayerId, A);

  const timedOut = toOvertime();
  timedOut.roundEndsAt = Date.now() - 1;
  assert.ok(tickRoundTimer(timedOut));
  assert.equal(timedOut.phase, "ENDED");
  assert.equal(timedOut.gameResult, "DRAW");
});

// ---------- Whole-game invariants ----------

test("positions are always possible: both neutral, or one top and one bottom", () => {
  for (const mode of ["CLASSIC", "THREE_ROUND"] as const) {
    for (let game = 0; game < 400; game += 1) {
      const state = newGame(mode);
      for (let step = 0; step < 400 && state.phase !== "ENDED"; step += 1) {
        if (!(takeBotTurn(state, A) || takeBotTurn(state, B))) break;
        const pair = [player(state, A).currentPosition, player(state, B).currentPosition].sort().join("+");
        assert.ok(pair === "NEUTRAL+NEUTRAL" || pair === "BOTTOM+TOP", `impossible positions ${pair} in ${mode}`);
        // No card is ever lost or duplicated: hands + draw pile + used pile = the 50-card deck.
        const cards = player(state, A).hand.length + player(state, B).hand.length + state.drawPile.length + state.playedPile.length;
        assert.equal(cards, 50, `${cards} cards accounted for in ${mode}`);
      }
    }
  }
});
