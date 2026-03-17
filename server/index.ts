// server/index.ts
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createGameState, applyAction, isPlayerInGame, tickRoundTimer } from "./logic";
import { Position } from "../shared/types";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }, // lock down later
});

type GameId = string;
const games = new Map<GameId, ReturnType<typeof createGameState>>();
const gameSessions = new Map<GameId, Map<string, string>>();
const gameConnectedPlayers = new Map<GameId, Set<string>>();
const gameLastActivity = new Map<GameId, number>();
const MAX_PLAYERS = 4;
const SESSION_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

function generateSixDigitGameId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createUniqueGameId() {
  let nextId = generateSixDigitGameId();
  while (games.has(nextId)) {
    nextId = generateSixDigitGameId();
  }
  return nextId;
}

function markGameActivity(gameId: string) {
  gameLastActivity.set(gameId, Date.now());
}

function deleteGameSession(gameId: string) {
  games.delete(gameId);
  gameSessions.delete(gameId);
  gameConnectedPlayers.delete(gameId);
  gameLastActivity.delete(gameId);
}

function registerConnectedPlayer(gameId: string, playerId: string) {
  const connectedPlayers = gameConnectedPlayers.get(gameId) ?? new Set<string>();
  connectedPlayers.add(playerId);
  gameConnectedPlayers.set(gameId, connectedPlayers);
}

function unregisterConnectedPlayer(gameId: string, playerId: string) {
  const connectedPlayers = gameConnectedPlayers.get(gameId);
  if (!connectedPlayers) return;

  connectedPlayers.delete(playerId);
  if (connectedPlayers.size === 0) {
    deleteGameSession(gameId);
    return;
  }

  gameConnectedPlayers.set(gameId, connectedPlayers);
}

function emitGameState(gameId: string, state: ReturnType<typeof createGameState>) {
  markGameActivity(gameId);
  io.to(gameId).emit("game:state", state);
}

function getJoinError(state: ReturnType<typeof createGameState>, playerName: string): string | null {
  if (state.players.length >= MAX_PLAYERS) return "Game is full";

  const cleanedName = playerName.trim();
  if (!cleanedName) return "Player name cannot be blank";

  const normalizedName = cleanedName.toLocaleLowerCase();
  const duplicateName = state.players.some((player) => player.name.trim().toLocaleLowerCase() === normalizedName);
  if (duplicateName) return "Player name already in use for this game";

  return null;
}

function getResumePlayerId(gameId: string, sessionId: string) {
  const gameSessionMap = gameSessions.get(gameId);
  if (!gameSessionMap) return null;
  return gameSessionMap.get(sessionId) ?? null;
}

io.on("connection", (socket) => {
  socket.on(
    "game:create",
    (
      payload: { mode?: "CLASSIC" | "THREE_ROUND" } | null,
      callback?: (response: { ok: true; gameId: string } | { ok: false; error: string }) => void,
    ) => {
      const gameId = createUniqueGameId();

      const state = createGameState(gameId);
      if (payload?.mode === "CLASSIC" || payload?.mode === "THREE_ROUND") {
        state.gameMode = payload.mode;
      }

      games.set(gameId, state);
      gameSessions.set(gameId, new Map());
      gameConnectedPlayers.set(gameId, new Set());
      markGameActivity(gameId);
      socket.join(gameId);
      emitGameState(gameId, state);
      callback?.({ ok: true, gameId });
    },
  );

  socket.on(
    "game:validateJoin",
    (
      { gameId, playerName, sessionId }: { gameId: string; playerName: string; sessionId?: string },
      callback?: (response: { ok: true } | { ok: false; error: string }) => void,
    ) => {
      const state = games.get(gameId);
      if (!state) {
        callback?.({ ok: false, error: "Game not found" });
        return;
      }

      if (sessionId && getResumePlayerId(gameId, sessionId)) {
        callback?.({ ok: true });
        return;
      }

      const joinError = getJoinError(state, playerName);
      if (joinError) {
        callback?.({ ok: false, error: joinError });
        return;
      }

      callback?.({ ok: true });
    },
  );

  socket.on(
    "game:join",
    (
      { gameId, playerName, sessionId }: { gameId: string; playerName: string; sessionId?: string },
      callback?: (response: { ok: true; playerId: string; state: ReturnType<typeof createGameState> } | { ok: false; error: string }) => void,
    ) => {
      const state = games.get(gameId);
      if (!state) {
        callback?.({ ok: false, error: "Game not found" });
        return socket.emit("game:error", "Game not found");
      }

      if (sessionId) {
        const existingPlayerId = getResumePlayerId(gameId, sessionId);
        if (existingPlayerId && isPlayerInGame(state, existingPlayerId)) {
          socket.data.playerId = existingPlayerId;
          socket.data.gameId = gameId;
          registerConnectedPlayer(gameId, existingPlayerId);
          markGameActivity(gameId);
          socket.join(gameId);
          emitGameState(gameId, state);
          callback?.({ ok: true, playerId: existingPlayerId, state });
          return;
        }
      }

      const joinError = getJoinError(state, playerName);
      if (joinError) {
        callback?.({ ok: false, error: joinError });
        return socket.emit("game:error", joinError);
      }

      const playerId = crypto.randomUUID();
      state.players.push({
        id: playerId,
        name: playerName.trim(),
        hand: [],
        score: 0,
        penaltyPoints: 0,
        currentPosition: "NEUTRAL",
        previousPosition: undefined,
        canCounterTakedown: false,
      });

      socket.data.playerId = playerId;
      socket.data.gameId = gameId;
      registerConnectedPlayer(gameId, playerId);
      if (sessionId) {
        const gameSessionMap = gameSessions.get(gameId) ?? new Map<string, string>();
        gameSessionMap.set(sessionId, playerId);
        gameSessions.set(gameId, gameSessionMap);
      }
      socket.join(gameId);

      emitGameState(gameId, state);
      callback?.({ ok: true, playerId, state });
    },
  );

  socket.on("game:setMode", ({ gameId, mode }: { gameId: string; mode: "CLASSIC" | "THREE_ROUND" }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    markGameActivity(gameId);
    const result = applyAction(state, { type: "SET_MODE", mode });
    if (!result.ok) return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
    emitGameState(gameId, state);
  });

  socket.on("round:coinWinnerDecision", ({ gameId, deferStartChoice }: { gameId: string; deferStartChoice: boolean }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    markGameActivity(gameId);
    const result = applyAction(state, { type: "ROUND2_DECISION", playerId, deferStartChoice });
    if (!result.ok) return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
    emitGameState(gameId, state);
  });

  socket.on("round:startPosition", ({ gameId, position }: { gameId: string; position: Position }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    markGameActivity(gameId);
    const result = applyAction(state, { type: "ROUND_START_POSITION", playerId, position });
    if (!result.ok) return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
    emitGameState(gameId, state);
  });

  socket.on("game:start", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");
    if (state.players.length < 2) return socket.emit("game:error", "Need at least 2 players to start");

    // deal 5 to each player
    markGameActivity(gameId);
    state.start();
    emitGameState(gameId, state);
  });

  socket.on("turn:playCard", ({ gameId, cardId }: { gameId: string; cardId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    if (!isPlayerInGame(state, playerId)) return socket.emit("game:error", "Not in this game");

    markGameActivity(gameId);
    const result = applyAction(state, { type: "PLAY_CARD", playerId, cardId });
    if (result.ok) {
      emitGameState(gameId, state);
      return;
    }

    return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
  });

  socket.on("turn:draw", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    markGameActivity(gameId);
    const result = applyAction(state, { type: "DRAW", playerId });
    if (result.ok) {
      emitGameState(gameId, state);
      return;
    }

    return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
  });

  socket.on("turn:endOfPeriodPosition", ({ gameId, position }: { gameId: string; position: Position }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    if (!isPlayerInGame(state, playerId)) return socket.emit("game:error", "Not in this game");

    markGameActivity(gameId);
    const result = applyAction(state, { type: "END_OF_PERIOD_POSITION", playerId, position });
    if (result.ok) {
      emitGameState(gameId, state);
      return;
    }

    return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
  });

  socket.on("game:requestRematch", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    if (!isPlayerInGame(state, playerId)) return socket.emit("game:error", "Not in this game");

    markGameActivity(gameId);
    const result = applyAction(state, { type: "REQUEST_REMATCH", playerId });
    if (result.ok) {
      emitGameState(gameId, state);
      return;
    }

    return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
  });

  socket.on("game:end", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    if (!isPlayerInGame(state, playerId)) return socket.emit("game:error", "Not in this game");

    markGameActivity(gameId);
    state.phase = "LOBBY";
    state.pendingEndOfPeriodPlayerId = undefined;
    state.pendingRound2DecisionPlayerId = undefined;
    state.pendingRound2StartPositionChooserPlayerId = undefined;
    state.pendingRound3StartPositionChooserPlayerId = undefined;
    state.rematchVotes = [];
    state.roundEndsAt = undefined;
    emitGameState(gameId, state);
  });

  socket.on("disconnect", () => {
    const gameId = socket.data.gameId as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!gameId || !playerId) return;

    unregisterConnectedPlayer(gameId, playerId);
  });
});

setInterval(() => {
  const now = Date.now();

  for (const [gameId, state] of games.entries()) {
    const lastActivity = gameLastActivity.get(gameId) ?? now;
    const connectedPlayers = gameConnectedPlayers.get(gameId);

    if (!connectedPlayers || connectedPlayers.size === 0) {
      deleteGameSession(gameId);
      continue;
    }

    if (now - lastActivity >= SESSION_INACTIVITY_TIMEOUT_MS) {
      deleteGameSession(gameId);
      continue;
    }

    const changed = tickRoundTimer(state);
    if (changed) {
      emitGameState(gameId, state);
    }
  }
}, 1000);

server.listen(3001, () => console.log("Server running on :3001"));
