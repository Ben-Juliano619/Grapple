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
  currentPosition: Position;
  previousPosition?: Position; // for out of bounds
  canCounterTakedown: boolean;
};

export type GameState = {
  id: string;
  players: Player[];
  drawPile: Card[];
  discardPile: Card[];
  playedPile: Card[];
  currentTurnIndex: number;
  phase: "LOBBY" | "FIND_START_NEUTRAL" | "PLAY" | "ENDED";
  gameMode: "CLASSIC" | "THREE_ROUND";
  playerBanners: Record<string, "GREEN" | "RED">;
  currentRound: number;
  roundWins: Record<string, number>;
  roundEndsAt?: number;
  roundStartChooserPlayerId?: string;
  round2CoinFlipWinnerPlayerId?: string;
  pendingRound2DecisionPlayerId?: string;
  pendingRound2StartPositionChooserPlayerId?: string;
  pendingRound3StartPositionChooserPlayerId?: string;
  gameWinnerPlayerId?: string;
  gameResult?: "WIN" | "DRAW";
  overtimeStubbed?: boolean;
  pendingEndOfPeriodPlayerId?: string;
  rematchVotes: string[];
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
const ROUND_DURATION_MS = 2 * 60 * 1000;

export function createGameState(id: string): GameState {
  const state: GameState = {
    id,
    players: [],
    drawPile: [],
    discardPile: [],
    playedPile: [],
    currentTurnIndex: 0,
    phase: "LOBBY",
    gameMode: "CLASSIC",
    playerBanners: {},
    currentRound: 0,
    roundWins: {},
    roundEndsAt: undefined,
    roundStartChooserPlayerId: undefined,
    round2CoinFlipWinnerPlayerId: undefined,
    pendingRound2DecisionPlayerId: undefined,
    pendingRound2StartPositionChooserPlayerId: undefined,
    pendingRound3StartPositionChooserPlayerId: undefined,
    gameWinnerPlayerId: undefined,
    gameResult: undefined,
    overtimeStubbed: false,
    pendingEndOfPeriodPlayerId: undefined,
    rematchVotes: [],
    start() {
      state.rematchVotes = [];
      state.pendingEndOfPeriodPlayerId = undefined;
      state.gameWinnerPlayerId = undefined;
      state.gameResult = undefined;
      state.overtimeStubbed = false;
      state.roundWins = {};
      state.roundStartChooserPlayerId = undefined;
      state.round2CoinFlipWinnerPlayerId = undefined;
      state.pendingRound2DecisionPlayerId = undefined;
      state.pendingRound2StartPositionChooserPlayerId = undefined;
      state.pendingRound3StartPositionChooserPlayerId = undefined;

      assignBanners(state);
      if (state.gameMode === "THREE_ROUND") {
        state.currentRound = 1;
      } else {
        state.currentRound = 0;
      }

      startFreshRound(state, state.currentRound === 0 ? undefined : "FIND_START_NEUTRAL");
    },
  };
  return state;
}

type Action =
  | { type: "SET_MODE"; mode: "CLASSIC" | "THREE_ROUND" }
  | { type: "PLAY_CARD"; playerId: string; cardId: string }
  | { type: "DRAW"; playerId: string }
  | { type: "END_OF_PERIOD_POSITION"; playerId: string; position: Position }
  | { type: "ROUND2_DECISION"; playerId: string; deferStartChoice: boolean }
  | { type: "ROUND_START_POSITION"; playerId: string; position: Position }
  | { type: "REQUEST_REMATCH"; playerId: string };

export function isPlayerInGame(state: GameState, playerId: string) {
  return state.players.some((p) => p.id === playerId);
}

export function applyAction(state: GameState, action: Action): { ok: true } | { ok: false; error: string } {
  if (action.type === "SET_MODE") {
    if (state.phase !== "LOBBY") return { ok: false, error: "Mode can only be changed in the lobby" };
    state.gameMode = action.mode;
    return { ok: true };
  }

  if (action.type === "REQUEST_REMATCH") {
    if (state.phase !== "ENDED") return { ok: false, error: "Rematch is only available after game end" };
    if (!isPlayerInGame(state, action.playerId)) return { ok: false, error: "Not in this game" };

    const alreadyVoted = state.rematchVotes.includes(action.playerId);
    if (!alreadyVoted) {
      state.rematchVotes.push(action.playerId);
    }

    if (state.rematchVotes.length >= 2) {
      state.start();
    }

    return { ok: true };
  }

  if (state.phase === "LOBBY") return { ok: false, error: "Game not started" };
  if (state.phase === "ENDED") return { ok: false, error: "Game already ended" };

  if (state.gameMode === "THREE_ROUND" && isRoundTimerExpired(state)) {
    finishRound(state, null);
    return { ok: true };
  }

  if (action.type === "ROUND2_DECISION") {
    if (state.pendingRound2DecisionPlayerId !== action.playerId) {
      return { ok: false, error: "You are not the coin flip winner" };
    }

    const otherPlayer = state.players.find((player) => player.id !== action.playerId);
    if (!otherPlayer) return { ok: false, error: "Round two requires exactly two players" };

    state.pendingRound2DecisionPlayerId = undefined;
    state.pendingRound2StartPositionChooserPlayerId = action.deferStartChoice ? otherPlayer.id : action.playerId;
    state.roundStartChooserPlayerId = state.pendingRound2StartPositionChooserPlayerId;
    return { ok: true };
  }

  if (action.type === "ROUND_START_POSITION") {
    const pendingChooser = state.pendingRound2StartPositionChooserPlayerId ?? state.pendingRound3StartPositionChooserPlayerId;
    if (!pendingChooser || pendingChooser !== action.playerId) {
      return { ok: false, error: "No round start position choice is pending for you" };
    }

    applyEndOfPeriodPositionChoice(state, action.playerId, action.position);
    state.pendingRound2StartPositionChooserPlayerId = undefined;
    state.pendingRound3StartPositionChooserPlayerId = undefined;
    state.roundEndsAt = Date.now() + ROUND_DURATION_MS;
    state.phase = "PLAY";
    return { ok: true };
  }

  const currentPlayer = state.players[state.currentTurnIndex];
  if (currentPlayer.id !== action.playerId) return { ok: false, error: "Not your turn" };

  if (action.type === "END_OF_PERIOD_POSITION") {
    if (state.pendingEndOfPeriodPlayerId !== action.playerId) {
      return { ok: false, error: "No end-of-period position choice is pending" };
    }

    applyEndOfPeriodPositionChoice(state, action.playerId, action.position);
    state.pendingEndOfPeriodPlayerId = undefined;
    endTurn(state);
    return { ok: true };
  }

  if (state.pendingEndOfPeriodPlayerId) {
    return { ok: false, error: "Choose your position for End of Period before continuing" };
  }

  if (action.type === "DRAW") {
    currentPlayer.hand.push(drawOne(state));
    endTurn(state);
    return { ok: true };
  }

  const cardIndex = currentPlayer.hand.findIndex((c) => c.id === action.cardId);
  if (cardIndex === -1) return { ok: false, error: "Card not in your hand" };

  const card = currentPlayer.hand[cardIndex];

  const legal = isCardLegal(state, card);
  if (!legal.ok) return legal;

  currentPlayer.hand.splice(cardIndex, 1);
  state.discardPile.push(card);
  state.playedPile.push(card);

  if (state.gameMode === "THREE_ROUND") {
    if (isPinningCard(card)) {
      finishRound(state, currentPlayer.id);
      return { ok: true };
    }

    if (card.kind === "END_OF_PERIOD") {
      finishRound(state, null);
      return { ok: true };
    }
  } else {
    if (isPinningCard(card) || currentPlayer.hand.length === 0) {
      state.phase = "ENDED";
      return { ok: true };
    }
  }

  const shouldEndTurn = applyCardEffects(state, card, currentPlayer.id);

  if (shouldEndTurn) {
    endTurn(state);
  }
  return { ok: true };
}

export function tickRoundTimer(state: GameState): boolean {
  if (state.gameMode !== "THREE_ROUND") return false;
  if (state.phase === "ENDED" || state.phase === "LOBBY") return false;
  if (!isRoundTimerExpired(state)) return false;
  finishRound(state, null);
  return true;
}

function assignBanners(state: GameState) {
  state.playerBanners = {};
  const [first, second] = state.players;
  if (!first || !second) return;
  state.playerBanners[first.id] = "GREEN";
  state.playerBanners[second.id] = "RED";
}

function startFreshRound(state: GameState, phaseOverride?: GameState["phase"]) {
  const deck = shuffle(buildDeck());
  state.drawPile = deck;
  state.discardPile = [];
  state.playedPile = [];
  state.currentTurnIndex = 0;
  state.pendingEndOfPeriodPlayerId = undefined;

  for (const player of state.players) {
    player.hand = [];
    for (let i = 0; i < 5; i += 1) {
      player.hand.push(drawOne(state));
    }
    player.score = 0;
    player.penaltyPoints = 0;
    player.currentPosition = "NEUTRAL";
    player.previousPosition = undefined;
    player.canCounterTakedown = false;
    state.roundWins[player.id] = state.roundWins[player.id] ?? 0;
  }

  if (state.gameMode === "THREE_ROUND") {
    state.phase = phaseOverride ?? "PLAY";
    state.roundEndsAt = phaseOverride === "FIND_START_NEUTRAL" ? Date.now() + ROUND_DURATION_MS : undefined;
  } else {
    state.phase = "FIND_START_NEUTRAL";
    state.roundEndsAt = undefined;
  }
}

function isRoundTimerExpired(state: GameState): boolean {
  return Boolean(state.roundEndsAt && Date.now() >= state.roundEndsAt);
}

function finishRound(state: GameState, winnerPlayerId: string | null) {
  if (winnerPlayerId) {
    state.roundWins[winnerPlayerId] = (state.roundWins[winnerPlayerId] ?? 0) + 1;
  }

  state.roundEndsAt = undefined;
  state.pendingEndOfPeriodPlayerId = undefined;

  if (state.currentRound === 1) {
    prepareRoundTwo(state);
    return;
  }

  if (state.currentRound === 2) {
    if (winnerPlayerId && (state.roundWins[winnerPlayerId] ?? 0) >= 2) {
      endThreeRoundGame(state, winnerPlayerId);
      return;
    }

    prepareRoundThree(state);
    return;
  }

  if (state.currentRound === 3) {
    const [first, second] = state.players;
    if (!first || !second) {
      endThreeRoundGame(state, null);
      return;
    }

    const firstWins = state.roundWins[first.id] ?? 0;
    const secondWins = state.roundWins[second.id] ?? 0;

    if (firstWins > secondWins) {
      endThreeRoundGame(state, first.id);
      return;
    }
    if (secondWins > firstWins) {
      endThreeRoundGame(state, second.id);
      return;
    }

    endThreeRoundGame(state, null);
  }
}

function prepareRoundTwo(state: GameState) {
  state.currentRound = 2;
  startFreshRound(state);

  const [first, second] = state.players;
  if (!first || !second) {
    endThreeRoundGame(state, null);
    return;
  }

  const winner = Math.random() < 0.5 ? first : second;
  state.round2CoinFlipWinnerPlayerId = winner.id;
  state.pendingRound2DecisionPlayerId = winner.id;
  state.phase = "PLAY";
}

function prepareRoundThree(state: GameState) {
  state.currentRound = 3;
  startFreshRound(state);

  if (!state.roundStartChooserPlayerId) {
    endThreeRoundGame(state, null);
    return;
  }

  const otherPlayer = state.players.find((player) => player.id !== state.roundStartChooserPlayerId);
  if (!otherPlayer) {
    endThreeRoundGame(state, null);
    return;
  }

  state.pendingRound3StartPositionChooserPlayerId = otherPlayer.id;
  state.phase = "PLAY";
}

function endThreeRoundGame(state: GameState, winnerPlayerId: string | null) {
  state.phase = "ENDED";
  state.gameWinnerPlayerId = winnerPlayerId ?? undefined;
  state.gameResult = winnerPlayerId ? "WIN" : "DRAW";
  state.overtimeStubbed = !winnerPlayerId;
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

  const player = state.players[state.currentTurnIndex];

  // Position-matching play
  if (player.currentPosition === "NEUTRAL" && (card.kind === "NEUTRAL" || card.kind === "ATTEMPT_TAKEDOWN")) 
    {
      player.currentPosition = "TOP"
      //set other player to the "Bottom"
      return { ok: true };
    }
  if (player.currentPosition === "TOP" && card.kind === "TOP") return { ok: true };
  if (player.currentPosition === "BOTTOM" && (card.kind === "BOTTOM" || card.kind === "TRIPOD" || card.kind === "SITOUT")) {
    return { ok: true };
  }

  if (card.kind === "COUNTER") {
    if (player.canCounterTakedown && player.currentPosition === "BOTTOM") return { ok: true };
    return { ok: false, error: "Counter can only be played right after a successful takedown" };
  }

  if (card.kind === "PIN") {
    const requiredPosition = getPinRequiredPosition(card);
    if (!requiredPosition) return { ok: false, error: "PIN card is missing a valid position" };
    if (player.currentPosition === requiredPosition) return { ok: true };
    return { ok: false, error: `PIN can only be played from ${requiredPosition}` };
  }

  return { ok: false, error: `Card not playable in ${player.currentPosition} position` };
}

function getPinRequiredPosition(card: Card): Position | null {
  const imageFile = card.imageFile?.toLowerCase() ?? "";
  if (imageFile.startsWith("top_")) return "TOP";
  if (imageFile.startsWith("bottom_")) return "BOTTOM";
  if (imageFile.startsWith("neutral_")) return "NEUTRAL";
  return null;
}

function applyCardEffects(state: GameState, card: Card, currentPlayerId: string): boolean {
  const currentPlayer = state.players.find((player) => player.id === currentPlayerId);
  if (!currentPlayer) return false;

  const otherPlayers = state.players.filter((player) => player.id !== currentPlayerId);
  const next = nextPlayer(state);

  currentPlayer.canCounterTakedown = false;

  switch (card.kind) {
    case "NEUTRAL": {
      const neutralWasTakedown = isNeutralTakedown(card);
      if (neutralWasTakedown) {
        currentPlayer.currentPosition = "TOP";
        for (const player of otherPlayers) {
          player.currentPosition = "BOTTOM";
          player.canCounterTakedown = true;
        }
        next.canCounterTakedown = true;
      } else {
        for (const player of state.players) {
          player.currentPosition = "NEUTRAL";
          player.canCounterTakedown = false;
        }
      }
      state.phase = "PLAY";
      return true;
    }

    case "ATTEMPT_TAKEDOWN":
      for (const player of state.players) {
        player.currentPosition = "NEUTRAL";
        player.canCounterTakedown = false;
      }
      state.phase = "PLAY";
      return true;

    case "COUNTER":
      for (const player of state.players) {
        player.currentPosition = "NEUTRAL";
        player.canCounterTakedown = false;
      }
      return true;

    case "TOP":
      currentPlayer.currentPosition = card.meta?.doesNotChangePosition ? currentPlayer.currentPosition : "TOP";
      return true;

    case "BOTTOM":
      currentPlayer.currentPosition = card.meta?.doesNotChangePosition ? currentPlayer.currentPosition : "BOTTOM";
      return true;

    case "TRIPOD":
    case "SITOUT":
      return true;

    case "BLOODTIME":
      // opponent loses next turn: easiest way is store a skip flag
      // MVP: just advance an extra turn right now
      endTurn(state);
      return true;

    case "OUT_OF_BOUNDS":
      // revert this player's position if known, else neutral
      currentPlayer.currentPosition = currentPlayer.previousPosition ?? "NEUTRAL";
      return true;

    case "PENALTY":
      next.penaltyPoints += 1;
      // next player loses turn: skip by ending twice
      endTurn(state);
      return true;

    case "STALLING":
      next.score = Math.max(0, next.score - 1);
      return true; // position maintained

    case "END_OF_PERIOD":
      state.pendingEndOfPeriodPlayerId = currentPlayerId;
      return false;

    default:
      return true;
  }
}

function applyEndOfPeriodPositionChoice(state: GameState, currentPlayerId: string, position: Position) {
  if (position === "NEUTRAL") {
    setAllPlayersToNeutral(state);
    return;
  }

  const currentPlayer = state.players.find((player) => player.id === currentPlayerId);
  if (!currentPlayer) return;

  currentPlayer.currentPosition = position;
  if (position === "TOP") {
    setOtherPlayersToBottom(state, currentPlayerId);
  } else {
    setOtherPlayersToTop(state, currentPlayerId);
  }
}

function setOtherPlayersToTop(state: GameState, currentPlayerId: string) {
    for (const player of state.players) {
      if (player.id === currentPlayerId) continue;
    player.currentPosition = "TOP";
  }
}

function setOtherPlayersToBottom(state: GameState, currentPlayerId: string) {
  for (const player of state.players) {
    if (player.id === currentPlayerId) continue;
    player.currentPosition = "BOTTOM";
  }
}

function setAllPlayersToNeutral(state: GameState) {
  for (const player of state.players) {
    player.currentPosition = "NEUTRAL";
    player.canCounterTakedown = false;
  }
}


function isNeutralTakedown(card: Card): boolean {
  if (card.kind !== "NEUTRAL") return false;

  const imageFile = card.imageFile?.toLowerCase() ?? "";
  const name = card.name.toLowerCase();
  return imageFile.includes("takedown") || name.includes("takedown");
}

function endTurn(state: GameState) {
  const currentPlayer = state.players[state.currentTurnIndex];
  currentPlayer.previousPosition = currentPlayer.currentPosition;
  currentPlayer.canCounterTakedown = false;
  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.players.length;
}


function nextPlayer(state: GameState) {
  return state.players[(state.currentTurnIndex + 1) % state.players.length];
}

function drawOne(state: GameState): Card {
  if (state.drawPile.length === 0) {
    const reshuffle = shuffle(state.playedPile);
    state.drawPile = reshuffle;
    state.playedPile = [];
  }
  const c = state.drawPile.pop();
  if (!c) throw new Error("No cards available");
  return c;
}

function isPinningCard(card: Card): boolean {
  const imageFile = (card.imageFile ?? "").toLowerCase().replace(/\.png$/i, "");
  return card.kind === "PIN" || imageFile.endsWith("_pin");
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
