// server/logic.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { Card, CardKind, Position } from "../shared/types";

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
  // neutral takedown can be countered by the next player
  canCounterTakedown: boolean;
  start: () => void;
};

const cardsPerGamePath = path.resolve(process.cwd(), "public/img/cards/cards_pergame.txt");

type CardTemplate = {
  imageFile: string;
  count: number;
  name: string;
  kind: CardKind;
  color: string;
  meta?: Card["meta"];
};

const DEFAULT_CARD_STYLE: Record<CardKind, { kind: CardKind; color: string }> = {
  TOP: { kind: "TOP", color: "#1E90FF" },
  BOTTOM: { kind: "BOTTOM", color: "#00AA00" },
  NEUTRAL: { kind: "NEUTRAL", color: "#000000" },
  COUNTER: { kind: "COUNTER", color: "#FF8C00" },
  BONUS: { kind: "BONUS", color: "#A020F0" },
  BLOODTIME: { kind: "BLOODTIME", color: "#FF0000" },
  STALLING: { kind: "STALLING", color: "#FFD700" },
  OUT_OF_BOUNDS: { kind: "OUT_OF_BOUNDS", color: "#808080" },
  PENALTY: { kind: "PENALTY", color: "#7CFC00" },
  END_OF_PERIOD: { kind: "END_OF_PERIOD", color: "#A020F0" },
  ATTEMPT_TAKEDOWN: { kind: "ATTEMPT_TAKEDOWN", color: "#111111" },
  PIN: { kind: "PIN", color: "#FFFFFF" },
  TRIPOD: { kind: "TRIPOD", color: "#00AA00" },
  SITOUT: { kind: "SITOUT", color: "#00AA00" },
};

function imageFileToName(imageFile: string): string {
  return imageFile
    .replace(/\.png$/i, "")
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function normalizeTypo(imageFile: string): string {
  if (imageFile === "neutral_head_lock_to_pin.pngc") {
    return "neutral_head_lock_to_pin.png";
  }
  return imageFile;
}

function getCardDefinition(imageFile: string): Omit<CardTemplate, "imageFile" | "count" | "name"> {
  if (imageFile.startsWith("neutral_")) {
    if (imageFile.includes("attempted_takedown")) {
      return DEFAULT_CARD_STYLE.ATTEMPT_TAKEDOWN;
    }
    if (imageFile.includes("to_pin")) {
      return DEFAULT_CARD_STYLE.PIN;
    }
    return DEFAULT_CARD_STYLE.NEUTRAL;
  }

  if (imageFile.startsWith("top_")) {
    if (imageFile.includes("to_pin")) {
      return DEFAULT_CARD_STYLE.PIN;
    }
    return DEFAULT_CARD_STYLE.TOP;
  }

  if (imageFile.startsWith("bottom_")) {
    if (imageFile.includes("tripod")) {
      return { ...DEFAULT_CARD_STYLE.TRIPOD, meta: { doesNotChangePosition: true } };
    }
    if (imageFile.includes("sit_out_no_change_of_position")) {
      return { ...DEFAULT_CARD_STYLE.SITOUT, meta: { doesNotChangePosition: true } };
    }
    if (imageFile.includes("sit_out")) {
      return DEFAULT_CARD_STYLE.SITOUT;
    }
    if (imageFile.includes("to_pin")) {
      return DEFAULT_CARD_STYLE.PIN;
    }
    return DEFAULT_CARD_STYLE.BOTTOM;
  }

  if (imageFile.startsWith("counter_")) {
    return DEFAULT_CARD_STYLE.COUNTER;
  }

  if (imageFile === "blood_time.png") {
    return DEFAULT_CARD_STYLE.BLOODTIME;
  }
  if (imageFile === "stalling.png") {
    return DEFAULT_CARD_STYLE.STALLING;
  }
  if (imageFile === "out_of_bounds.png") {
    return DEFAULT_CARD_STYLE.OUT_OF_BOUNDS;
  }
  if (imageFile === "penalty.png") {
    return DEFAULT_CARD_STYLE.PENALTY;
  }
  if (imageFile === "end_of_period.png") {
    return DEFAULT_CARD_STYLE.END_OF_PERIOD;
  }

  return DEFAULT_CARD_STYLE.BONUS;
}

function loadCardTemplates(): CardTemplate[] {
  const content = readFileSync(cardsPerGamePath, "utf8");
  const templates: CardTemplate[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.includes("total cards per game")) continue;
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const count = Number(match[1]);
    const imageFile = normalizeTypo(match[2].trim());
    const definition = getCardDefinition(imageFile);

    templates.push({
      imageFile,
      count,
      name: imageFileToName(imageFile),
      ...definition,
    });
  }

  return templates;
}

const CARD_TEMPLATES = loadCardTemplates();

export function createGameState(id: string): GameState {
  const state: GameState = {
    id,
    players: [],
    drawPile: [],
    discardPile: [],
    currentTurnIndex: 0,
    currentPosition: "NEUTRAL",
    phase: "LOBBY",
    canCounterTakedown: false,
    start() {
      const deck = shuffle(buildDeck());
      state.drawPile = deck;
      state.discardPile = [];
      state.currentTurnIndex = 0;
      state.currentPosition = "NEUTRAL";
      state.previousPosition = undefined;
      state.phase = "FIND_START_NEUTRAL";
      state.canCounterTakedown = false;

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
    if (card.kind !== "NEUTRAL" && card.kind !== "ATTEMPT_TAKEDOWN") {
      return { ok: false, error: "Must play a Neutral card to start (or draw)" };
    }
    return { ok: true };
  }

  // Anytime cards
  const anytime = new Set(["BLOODTIME", "END_OF_PERIOD", "OUT_OF_BOUNDS", "PENALTY", "STALLING"]);
  if (anytime.has(card.kind)) return { ok: true };

  // Position-matching play
  if (state.currentPosition === "NEUTRAL" && (card.kind === "NEUTRAL" || card.kind === "ATTEMPT_TAKEDOWN")) return { ok: true };
  if (state.currentPosition === "TOP" && card.kind === "TOP") return { ok: true };
  if (state.currentPosition === "BOTTOM" && (card.kind === "BOTTOM" || card.kind === "TRIPOD" || card.kind === "SITOUT")) {
    return { ok: true };
  }

  if (card.kind === "COUNTER") {
    if (state.canCounterTakedown && state.currentPosition === "BOTTOM") return { ok: true };
    return { ok: false, error: "Counter can only be played right after a successful takedown" };
  }

  return { ok: false, error: `Card not playable in ${state.currentPosition} position` };
}

function applyCardEffects(state: GameState, card: Card) {
  state.canCounterTakedown = false;

  switch (card.kind) {
    case "NEUTRAL": {
      const neutralWasTakedown = isNeutralTakedown(card);
      state.currentPosition = neutralWasTakedown ? "BOTTOM" : "NEUTRAL";
      state.canCounterTakedown = neutralWasTakedown;
      state.phase = "PLAY";
      return;
    }

    case "ATTEMPT_TAKEDOWN":
      state.currentPosition = "NEUTRAL";
      state.phase = "PLAY";
      return;

    case "COUNTER":
      state.currentPosition = "NEUTRAL";
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

    default:
      return;
  }
}

function isNeutralTakedown(card: Card): boolean {
  if (card.kind !== "NEUTRAL") return false;

  const imageFile = card.imageFile?.toLowerCase() ?? "";
  const name = card.name.toLowerCase();
  return imageFile.includes("takedown") || name.includes("takedown");
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

function buildDeck(): Card[] {
  const deck: Card[] = [];

  for (const template of CARD_TEMPLATES) {
    for (let i = 0; i < template.count; i += 1) {
      deck.push({
        id: crypto.randomUUID(),
        name: template.name,
        kind: template.kind,
        color: template.color,
        imageFile: template.imageFile,
        meta: template.meta,
      });
    }
  }

  return deck;
}
