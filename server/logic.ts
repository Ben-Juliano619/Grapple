// server/logic.ts
import { Card, Position } from "../shared/types";

type Player = {
  id: string;
  name: string;
  hand: Card[];
  score: number;
  penaltyPoints: number;
};

export type GameState = {
  id: string;
  players: Player[];
  drawPile: Card[];
  discardPile: Card[];
  currentTurnIndex: number;
  currentPosition: Position;
  phase: "LOBBY" | "FIND_START_NEUTRAL" | "PLAY" | "ENDED";
  previousPosition?: Position; // for out of bounds
  // optional: pendingAttack etc later
  start: () => void;
};

export function createGameState(id: string): GameState {
  const state: GameState = {
    id,
    players: [],
    drawPile: [],
    discardPile: [],
    currentTurnIndex: 0,
    currentPosition: "NEUTRAL",
    phase: "LOBBY",
    start() {
      const deck = shuffle(buildDeck());
      state.drawPile = deck;
      state.discardPile = [];
      state.currentTurnIndex = 0;
      state.currentPosition = "NEUTRAL";
      state.previousPosition = undefined;
      state.phase = "FIND_START_NEUTRAL";

      for (const player of state.players) {
        player.hand = [];
        for (let i = 0; i < 5; i += 1) {
          player.hand.push(drawOne(state));
        }
        player.score = 0;
        player.penaltyPoints = 0;
      }
    },
  };
  return state;
}


type Action =
  | { type: "PLAY_CARD"; playerId: string; cardId: string }
  | { type: "DRAW"; playerId: string };

export function isPlayerInGame(state: GameState, playerId: string) {
  return state.players.some((p) => p.id === playerId);
}

export function applyAction(state: GameState, action: Action): { ok: true } | { ok: false; error: string } {
  if (state.phase === "LOBBY") return { ok: false, error: "Game not started" };
  if (state.phase === "ENDED") return { ok: false, error: "Game already ended" };

  const currentPlayer = state.players[state.currentTurnIndex];
  if (currentPlayer.id !== action.playerId) return { ok: false, error: "Not your turn" };

  if (action.type === "DRAW") {
    // In your rules: draw happens when you cannot play (we enforce lightly in MVP)
    currentPlayer.hand.push(drawOne(state));
    endTurn(state);
    return { ok: true };
  }

  // PLAY_CARD
  const cardIndex = currentPlayer.hand.findIndex((c) => c.id === action.cardId);
  if (cardIndex === -1) return { ok: false, error: "Card not in your hand" };

  const card = currentPlayer.hand[cardIndex];

  const legal = isCardLegal(state, card);
  if (!legal.ok) return legal;

  // remove from hand, put on discard
  currentPlayer.hand.splice(cardIndex, 1);
  state.discardPile.push(card);

  // win condition: pin
  if (card.kind === "PIN") {
    state.phase = "ENDED";
    return { ok: true };
  }

  // win condition: used all cards
  if (currentPlayer.hand.length === 0) {
    state.phase = "ENDED";
    return { ok: true };
  }

  // apply effects
  applyCardEffects(state, card);

  endTurn(state);
  return { ok: true };
}

function isCardLegal(state: GameState, card: Card): { ok: true } | { ok: false; error: string } {
  // Phase: find neutral
  if (state.phase === "FIND_START_NEUTRAL") {
    if (card.kind !== "NEUTRAL") return { ok: false, error: "Must play a Neutral card to start (or draw)" };
    return { ok: true };
  }

  // Anytime cards
  const anytime = new Set([
    "BLOODTIME",
    "END_OF_PERIOD",
    "OUT_OF_BOUNDS",
    "PENALTY",
    "STALLING",
  ]);
  if (anytime.has(card.kind)) return { ok: true };

  // Position-matching play
  if (state.currentPosition === "NEUTRAL" && card.kind === "NEUTRAL") return { ok: true };
  if (state.currentPosition === "TOP" && card.kind === "TOP") return { ok: true };
  if (state.currentPosition === "BOTTOM" && (card.kind === "BOTTOM" || card.kind === "TRIPOD" || card.kind === "SITOUT")) {
    return { ok: true };
  }

  // TODO: COUNTER legality (needs pendingAttack)
  if (card.kind === "COUNTER") return { ok: false, error: "Counter can only be played to defend a takedown (not implemented yet)" };

  return { ok: false, error: `Card not playable in ${state.currentPosition} position` };
}

function applyCardEffects(state: GameState, card: Card) {
  switch (card.kind) {
    case "NEUTRAL":
      state.currentPosition = "NEUTRAL";
      state.phase = "PLAY";
      return;

    case "TOP":
      // many top moves likely keep TOP; some may switch to NEUTRAL, etc.
      state.currentPosition = card.meta?.doesNotChangePosition ? state.currentPosition : "TOP";
      return;

    case "BOTTOM":
      state.currentPosition = card.meta?.doesNotChangePosition ? state.currentPosition : "BOTTOM";
      return;
    case "TRIPOD":
    case "SITOUT":
      return;

    case "BLOODTIME":
      // opponent loses next turn: easiest way is store a skip flag
      // MVP: just advance an extra turn right now
      endTurn(state);
      return;

    case "OUT_OF_BOUNDS":
      // revert to previous position if known, else neutral
      state.currentPosition = state.previousPosition ?? "NEUTRAL";
      return;

    case "PENALTY": {
      const next = nextPlayer(state);
      next.penaltyPoints += 1;
      // next player loses turn: skip by ending twice
      endTurn(state);
      return;
    }

    case "STALLING": {
      const next = nextPlayer(state);
      next.score = Math.max(0, next.score - 1);
      return; // position maintained
    }

    case "END_OF_PERIOD":
      // MVP: let player choose later; for now keep current position
      return;

    case "ATTEMPT_TAKEDOWN":
      // MVP interpretation: just discard; no points; does not change position
      return;

    default:
      return;
  }
}

function endTurn(state: GameState) {
  state.previousPosition = state.currentPosition;
  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.players.length;
}

function nextPlayer(state: GameState) {
  return state.players[(state.currentTurnIndex + 1) % state.players.length];
}

function drawOne(state: GameState): Card {
  if (state.drawPile.length === 0) {
    // reshuffle discard minus top
    const top = state.discardPile.pop();
    const reshuffle = shuffle(state.discardPile);
    state.drawPile = reshuffle;
    state.discardPile = top ? [top] : [];
  }
  const c = state.drawPile.pop();
  if (!c) throw new Error("No cards available");
  return c;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// TODO: replace with your real deck list
function buildDeck(): Card[] {
  const mk = (name: string, kind: any, color: string, meta?: any): Card => ({
    id: crypto.randomUUID(),
    name,
    kind,
    color,
    meta,
  });

  return [
    mk("Neutral Stance", "NEUTRAL", "#000000"),
    mk("Shot Setup", "NEUTRAL", "#000000"),
    mk("Hand Fight", "NEUTRAL", "#000000"),
    mk("Top Control", "TOP", "#1E90FF"),
    mk("Half Nelson", "TOP", "#1E90FF"),
    mk("Ride Legs", "TOP", "#1E90FF"),
    mk("Stand Up", "BOTTOM", "#00AA00"),
    mk("Sit Out", "SITOUT", "#00AA00", { doesNotChangePosition: true }),
    mk("Tripod", "TRIPOD", "#00AA00", { doesNotChangePosition: true }),
    mk("Blood Time", "BLOODTIME", "#FF0000"),
    mk("Penalty", "PENALTY", "#7CFC00"),
    mk("Out of Bounds", "OUT_OF_BOUNDS", "#808080"),
    mk("Stalling", "STALLING", "#FFD700"),
    mk("End of Period", "END_OF_PERIOD", "#A020F0"),
    mk("Attempt Takedown", "ATTEMPT_TAKEDOWN", "#000000"),
    mk("Pin", "PIN", "#FFFFFF"),
  ];
}
