// server/index.ts
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createGameState, applyAction, isPlayerInGame, tickRoundTimer } from "./logic";
import { Position } from "../shared/types";
import {
  CLEANUP_INTERVAL_MS,
  createGameSessionState,
  markConnected as markSessionConnected,
  markDisconnected as markSessionDisconnected,
  type GameSessionState,
  shouldCleanupGame,
} from "./sessionLifecycle";

const app = express();
const server = http.createServer(app);

app.use((_, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

const io = new Server(server, {
  cors: { origin: "*" }, // lock down later
});

type GameId = string;
const games = new Map<GameId, ReturnType<typeof createGameState>>();
const gameSessions = new Map<GameId, GameSessionState>();
const MAX_PLAYERS = 4;

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
  return gameSessionMap.sessionToPlayerId.get(sessionId) ?? null;
}

function isReconnectableSession(gameId: string, sessionId: string) {
  const state = games.get(gameId);
  const sessionState = gameSessions.get(gameId);
  if (!state || !sessionState) return false;

  const playerId = sessionState.sessionToPlayerId.get(sessionId);
  if (!playerId) return false;
  if (state.phase === "ENDED" || !isPlayerInGame(state, playerId)) {
    sessionState.sessionToPlayerId.delete(sessionId);
    return false;
  }
  return true;
}

function markConnected(gameId: string, socketId: string) {
  const sessionState = gameSessions.get(gameId);
  if (!sessionState) return;
  markSessionConnected(sessionState, socketId);
}

function markDisconnected(gameId: string, socketId: string, now: number) {
  const sessionState = gameSessions.get(gameId);
  if (!sessionState) return;
  markSessionDisconnected(sessionState, socketId, now);
}

function deleteGame(gameId: string) {
  games.delete(gameId);
  gameSessions.delete(gameId);
}

app.get("/api/session/validate", (req, res) => {
  const gameId = String(req.query.gameId ?? "");
  const sessionId = String(req.query.sessionId ?? "");

  if (!gameId || !sessionId) {
    return res.status(400).json({ ok: false, valid: false, reason: "Missing gameId or sessionId" });
  }

  const valid = isReconnectableSession(gameId, sessionId);
  return res.json({ ok: true, valid });
});

io.on("connection", (socket) => {
  socket.on(
    "game:create",
    (
      payload: { mode?: "CLASSIC" | "THREE_ROUND" } | null,
      callback?: (response: { ok: true; gameId: string } | { ok: false; error: string }) => void,
    ) => {
      const gameId = createUniqueGameId();
      const now = Date.now();

      const state = createGameState(gameId);
      if (payload?.mode === "CLASSIC" || payload?.mode === "THREE_ROUND") {
        state.gameMode = payload.mode;
      }

      games.set(gameId, state);
      gameSessions.set(gameId, createGameSessionState(now));
      socket.join(gameId);
      io.to(gameId).emit("game:state", state);
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

      if (sessionId && isReconnectableSession(gameId, sessionId)) {
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
          socket.join(gameId);
          markConnected(gameId, socket.id);
          io.to(gameId).emit("game:state", state);
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
      if (sessionId) {
        const gameSessionState = gameSessions.get(gameId) ?? createGameSessionState(Date.now());
        gameSessionState.sessionToPlayerId.set(sessionId, playerId);
        gameSessions.set(gameId, gameSessionState);
      }
      socket.join(gameId);
      markConnected(gameId, socket.id);

      io.to(gameId).emit("game:state", state);
      callback?.({ ok: true, playerId, state });
    },
  );

  socket.on("game:setMode", ({ gameId, mode }: { gameId: string; mode: "CLASSIC" | "THREE_ROUND" }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const result = applyAction(state, { type: "SET_MODE", mode });
    if (!result.ok) return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
    io.to(gameId).emit("game:state", state);
  });

  socket.on("round:coinWinnerDecision", ({ gameId, deferStartChoice }: { gameId: string; deferStartChoice: boolean }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    const result = applyAction(state, { type: "ROUND2_DECISION", playerId, deferStartChoice });
    if (!result.ok) return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
    io.to(gameId).emit("game:state", state);
  });

  socket.on("round:startPosition", ({ gameId, position }: { gameId: string; position: Position }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    const result = applyAction(state, { type: "ROUND_START_POSITION", playerId, position });
    if (!result.ok) return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
    io.to(gameId).emit("game:state", state);
  });

  socket.on("game:start", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");
    if (state.players.length < 2) return socket.emit("game:error", "Need at least 2 players to start");

    // deal 5 to each player
    state.start();
    io.to(gameId).emit("game:state", state);
  });

  socket.on("turn:playCard", ({ gameId, cardId }: { gameId: string; cardId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    if (!isPlayerInGame(state, playerId)) return socket.emit("game:error", "Not in this game");

    const result = applyAction(state, { type: "PLAY_CARD", playerId, cardId });
    if (result.ok) {
      io.to(gameId).emit("game:state", state);
      return;
    }

    return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
  });

  socket.on("turn:draw", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    const result = applyAction(state, { type: "DRAW", playerId });
    if (result.ok) {
      io.to(gameId).emit("game:state", state);
      return;
    }

    return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
  });

  socket.on("turn:endOfPeriodPosition", ({ gameId, position }: { gameId: string; position: Position }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    if (!isPlayerInGame(state, playerId)) return socket.emit("game:error", "Not in this game");

    const result = applyAction(state, { type: "END_OF_PERIOD_POSITION", playerId, position });
    if (result.ok) {
      io.to(gameId).emit("game:state", state);
      return;
    }

    return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
  });


  socket.on("game:requestRematch", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    if (!isPlayerInGame(state, playerId)) return socket.emit("game:error", "Not in this game");

    const result = applyAction(state, { type: "REQUEST_REMATCH", playerId });
    if (result.ok) {
      io.to(gameId).emit("game:state", state);
      return;
    }

    return socket.emit("game:error", "error" in result ? result.error : "Unknown error");
  });

  socket.on("game:end", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    if (!isPlayerInGame(state, playerId)) return socket.emit("game:error", "Not in this game");

    io.to(gameId).emit("game:ended");
    deleteGame(gameId);
  });

  socket.on("disconnect", () => {
    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return;
    markDisconnected(gameId, socket.id, Date.now());
  });
});

setInterval(() => {
  for (const [gameId, state] of games.entries()) {
    const changed = tickRoundTimer(state);
    if (changed) {
      io.to(gameId).emit("game:state", state);
    }
  }
}, 1000);

setInterval(() => {
  const now = Date.now();

  for (const [gameId, sessionState] of gameSessions.entries()) {
    if (shouldCleanupGame(sessionState, now)) {
      io.to(gameId).emit("game:ended");
      deleteGame(gameId);
    }
  }
}, CLEANUP_INTERVAL_MS);

server.listen(3001, () => console.log("Server running on :3001"));
