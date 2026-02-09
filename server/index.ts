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

io.on("connection", (socket) => {
  socket.on("game:create", () => {
    const gameId = crypto.randomUUID();
    const state = createGameState();
    games.set(gameId, state);
    socket.join(gameId);
    socket.emit("game:state", state);
  });

  socket.on("game:join", ({ gameId, playerName }: { gameId: string; playerName: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

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
  });

  socket.on("game:start", ({ gameId }: { gameId: string }) => {
    const state = games.get(gameId);
    if (!state) return socket.emit("game:error", "Game not found");

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
