// server/index.ts
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createGameState, applyAction, isPlayerInGame } from "./logic";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }, // lock down later
});

type GameId = string;
const games = new Map<GameId, ReturnType<typeof createGameState>>();
const MAX_PLAYERS = 4;

io.on("connection", (socket) => {
  socket.on("game:create", (payload: { gameId?: string } | null, callback?: (response: { ok: true; gameId: string } | { ok: false; error: string }) => void) => {
    const requestedId = typeof payload?.gameId === "string" ? payload.gameId.trim() : "";
    if (requestedId && games.has(requestedId)) {
      callback?.({ ok: false, error: "Game ID already in use" });
      return socket.emit("game:error", "Game ID already in use");
    }
    if (payload?.gameId !== undefined && !requestedId) {
      callback?.({ ok: false, error: "Game ID cannot be blank" });
      return socket.emit("game:error", "Game ID cannot be blank");
    }

    const gameId = requestedId || crypto.randomUUID();
    const state = createGameState(gameId);
    games.set(gameId, state);
    socket.join(gameId);
    socket.emit("game:state", state);
    callback?.({ ok: true, gameId });
  });

  socket.on(
    "game:join",
    (
      { gameId, playerName }: { gameId: string; playerName: string },
      callback?: (response: { ok: true; playerId: string; state: ReturnType<typeof createGameState> } | { ok: false; error: string }) => void,
    ) => {
    const state = games.get(gameId);
    if (!state) {
      callback?.({ ok: false, error: "Game not found" });
      return socket.emit("game:error", "Game not found");
    }
    if (state.players.length >= MAX_PLAYERS) {
      callback?.({ ok: false, error: "Game is full" });
      return socket.emit("game:error", "Game is full");
    }

    const playerId = crypto.randomUUID();
    state.players.push({
      id: playerId,
      name: playerName,
      hand: [],
      score: 0,
      penaltyPoints: 0,
    });

    socket.data.playerId = playerId;
    socket.join(gameId);

    io.to(gameId).emit("game:state", state);
    callback?.({ ok: true, playerId, state });
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
    if (!result.ok) return socket.emit("game:error", result.error);

    io.to(gameId).emit("game:state", state);
  });

  socket.on("turn:draw", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

    const playerId = socket.data.playerId as string;
    const result = applyAction(state, { type: "DRAW", playerId });
    if (!result.ok) return socket.emit("game:error", result.error);

    io.to(gameId).emit("game:state", state);
  });
});

server.listen(3001, () => console.log("Server running on :3001"));
