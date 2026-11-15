// server/bot.ts
// A simple computer opponent for practice games. It never peeks at hidden
// information: it just tries the cards in its own hand and plays the first
// one the rules accept (pins first), otherwise it draws.
import type { Position } from "../shared/types";
import { applyAction, type GameState } from "./logic";

export const BOT_NAME = "Coach Bot";

const PREFERRED_START_POSITION: Position = "TOP";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Makes at most one move for the bot if the game is waiting on it.
 * Returns true when the state changed.
 */
export function takeBotTurn(state: GameState, botId: string): boolean {
  const bot = state.players.find((player) => player.id === botId);
  if (!bot || state.phase === "LOBBY") return false;

  if (state.phase === "ENDED") {
    // Agree to a rematch as soon as the human asks for one.
    const humanWantsRematch = state.rematchVotes.some((id) => id !== botId);
    if (humanWantsRematch && !state.rematchVotes.includes(botId)) {
      return applyAction(state, { type: "REQUEST_REMATCH", playerId: botId }).ok;
    }
    return false;
  }

  if (state.pendingRound2DecisionPlayerId === botId) {
    return applyAction(state, { type: "ROUND2_DECISION", playerId: botId, deferStartChoice: false }).ok;
  }

  const pendingStartChooser = state.pendingRound2StartPositionChooserPlayerId ?? state.pendingRound3StartPositionChooserPlayerId;
  if (pendingStartChooser === botId) {
    return applyAction(state, { type: "ROUND_START_POSITION", playerId: botId, position: PREFERRED_START_POSITION }).ok;
  }
  // Someone else still has to choose; nothing to do until they do.
  if (state.pendingRound2DecisionPlayerId || pendingStartChooser) return false;

  const currentPlayer = state.players[state.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== botId) return false;

  if (state.pendingEndOfPeriodPlayerId === botId) {
    return applyAction(state, { type: "END_OF_PERIOD_POSITION", playerId: botId, position: PREFERRED_START_POSITION }).ok;
  }

  // Pins win immediately, so try them first; otherwise any legal card.
  // applyAction only changes the state when the card is legal, so trying
  // cards one by one is safe.
  const hand = shuffled(bot.hand);
  const ordered = [...hand.filter((card) => card.kind === "PIN"), ...hand.filter((card) => card.kind !== "PIN")];
  for (const card of ordered) {
    if (applyAction(state, { type: "PLAY_CARD", playerId: botId, cardId: card.id }).ok) return true;
  }

  return applyAction(state, { type: "DRAW", playerId: botId }).ok;
}
