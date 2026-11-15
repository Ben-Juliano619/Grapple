// server/index.ts
import express from "express";
import http from "http";
import { Server, type Socket } from "socket.io";
import { createGameState, applyAction, isPlayerInGame, tickRoundTimer, type GameState } from "./logic";
import { BOT_NAME, takeBotTurn } from "./bot";
import {
  CLEANUP_INTERVAL_MS,
  createGameSessionState,
  markConnected as markSessionConnected,
  markDisconnected as markSessionDisconnected,
  type GameSessionState,
  shouldCleanupGame,
} from "./sessionLifecycle";
import {
  RateLimiter,
  clientIp,
  isPlainObject,
  parseCardId,
  parseGameId,
  parseMode,
  parsePlayerName,
  parsePosition,
  parseSessionId,
  playerView,
} from "./security";

const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const webClientOrigin = process.env.CLIENT_URL || "https://grapplewrestlingcardgame.com";
// Native app shells (Capacitor) serve the bundled frontend from these origins.
const nativeAppOrigins = ["capacitor://localhost", "ionic://localhost", "http://localhost", "https://localhost"];
const allowedOrigins = isProduction ? [webClientOrigin, ...nativeAppOrigins] : "*";
// Behind Railway's proxy the real client IP is in X-Forwarded-For.
const trustProxy = process.env.TRUST_PROXY ? process.env.TRUST_PROXY === "true" : isProduction;

// ---------- Abuse limits ----------
// All per-IP / per-connection. RATE_LIMIT_MULTIPLIER scales them, e.g. set it
// to 100 temporarily while running an automated load / pen test from one IP.
const LIMIT_SCALE = Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER) || 1);
const LIMITS = {
  eventsPerSecond: 10 * LIMIT_SCALE, // any socket message, per connection
  eventBurst: 30 * LIMIT_SCALE,
  gamesCreatedPerMinute: 10 * LIMIT_SCALE, // per IP
  joinAttemptsPerMinute: 30 * LIMIT_SCALE, // per IP (slows down guessing game codes)
  httpPerMinute: 60 * LIMIT_SCALE, // per IP
  connectionsPerIp: 20 * LIMIT_SCALE,
  activeGamesPerIp: 10 * LIMIT_SCALE,
  maxActiveGames: 5000,
  droppedEventsBeforeDisconnect: 100,
};

const eventLimiter = new RateLimiter(LIMITS.eventBurst, LIMITS.eventsPerSecond);
const createLimiter = new RateLimiter(LIMITS.gamesCreatedPerMinute, LIMITS.gamesCreatedPerMinute / 60);
const joinLimiter = new RateLimiter(LIMITS.joinAttemptsPerMinute, LIMITS.joinAttemptsPerMinute / 60);
const httpLimiter = new RateLimiter(LIMITS.httpPerMinute, LIMITS.httpPerMinute / 60);
const connectionsPerIp = new Map<string, number>();

// ---------- HTTP ----------

const app = express();
app.disable("x-powered-by");
const server = http.createServer(app);

function resolveCorsOrigin(requestOrigin: string | undefined) {
  if (allowedOrigins === "*") return "*";
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) return requestOrigin;
  return webClientOrigin;
}

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", resolveCorsOrigin(req.headers.origin));
  res.header("Vary", "Origin");
  res.header("X-Content-Type-Options", "nosniff");
  if (!httpLimiter.take(clientIp(req.headers, req.socket.remoteAddress, trustProxy))) {
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }
  next();
});

const io = new Server(server, {
  cors: { origin: allowedOrigins },
  // Game messages are tiny; refuse anything big.
  maxHttpBufferSize: 8 * 1024,
});

// ---------- Game storage ----------

type GameId = string;
const games = new Map<GameId, GameState>();
const gameSessions = new Map<GameId, GameSessionState>();
const gameCreatorIp = new Map<GameId, string>();
const MAX_PLAYERS = 2;
// Practice games: gameId -> the bot's player id.
const botPlayers = new Map<GameId, string>();
const BOT_MOVE_DELAY_MS = 900;
const pendingBotMoves = new Set<GameId>();

/** Send each socket in the game only what that player is allowed to see. */
function broadcastState(gameId: GameId, state: GameState) {
  const room = io.sockets.adapter.rooms.get(gameId);
  for (const socketId of room ?? []) {
    const socket = io.sockets.sockets.get(socketId);
    socket?.emit("game:state", playerView(state, socket.data.playerId));
  }
  scheduleBotMove(gameId);
}

// After every state change, give the bot a moment and let it move if the
// game is waiting on it. Each bot move broadcasts again, which chains turns.
function scheduleBotMove(gameId: GameId) {
  const botId = botPlayers.get(gameId);
  if (!botId || pendingBotMoves.has(gameId)) return;
  pendingBotMoves.add(gameId);
  setTimeout(() => {
    pendingBotMoves.delete(gameId);
    const state = games.get(gameId);
    if (!state) return;
    try {
      if (takeBotTurn(state, botId)) broadcastState(gameId, state);
    } catch (error) {
      console.error(`[bot] game ${gameId} failed:`, error);
    }
  }, BOT_MOVE_DELAY_MS);
}

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

function getJoinError(state: GameState, playerName: string): string | null {
  if (state.players.length >= MAX_PLAYERS) return "Game is full";
  const normalizedName = playerName.toLocaleLowerCase();
  const duplicateName = state.players.some((player) => player.name.toLocaleLowerCase() === normalizedName);
  if (duplicateName) return "Player name already in use for this game";
  return null;
}

function getResumePlayerId(gameId: string, sessionId: string) {
  return gameSessions.get(gameId)?.sessionToPlayerId.get(sessionId) ?? null;
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
  if (sessionState) markSessionConnected(sessionState, socketId);
}

function markDisconnected(gameId: string, socketId: string, now: number) {
  const sessionState = gameSessions.get(gameId);
  if (sessionState) markSessionDisconnected(sessionState, socketId, now);
}

function activeGamesFor(ip: string) {
  let count = 0;
  for (const creator of gameCreatorIp.values()) if (creator === ip) count += 1;
  return count;
}

function deleteGame(gameId: string) {
  games.delete(gameId);
  gameSessions.delete(gameId);
  gameCreatorIp.delete(gameId);
  botPlayers.delete(gameId);
  pendingBotMoves.delete(gameId);
}

/** Leave whatever game room this socket was in before joining another. */
function leaveCurrentGame(socket: Socket) {
  const previous = socket.data.gameId as string | undefined;
  if (!previous) return;
  socket.leave(previous);
  markDisconnected(previous, socket.id, Date.now());
  socket.data.gameId = undefined;
  socket.data.playerId = undefined;
}

app.get("/api/session/validate", (req, res) => {
  const gameId = parseGameId(req.query.gameId);
  const sessionId = parseSessionId(req.query.sessionId);
  if (!gameId || !sessionId) {
    return res.status(400).json({ ok: false, valid: false, reason: "Missing or invalid gameId or sessionId" });
  }
  return res.json({ ok: true, valid: isReconnectableSession(gameId, sessionId) });
});

// ---------- Sockets ----------

type Ack = (response: unknown) => void;
type Payload = Record<string, unknown>;

// Limit simultaneous connections from one IP.
io.use((socket, next) => {
  const ip = clientIp(socket.handshake.headers, socket.handshake.address, trustProxy);
  const count = connectionsPerIp.get(ip) ?? 0;
  if (count >= LIMITS.connectionsPerIp) return next(new Error("Too many connections"));
  connectionsPerIp.set(ip, count + 1);
  socket.data.ip = ip;
  socket.on("disconnect", () => {
    const remaining = (connectionsPerIp.get(ip) ?? 1) - 1;
    if (remaining <= 0) connectionsPerIp.delete(ip);
    else connectionsPerIp.set(ip, remaining);
  });
  next();
});

io.on("connection", (socket) => {
  let droppedEvents = 0;

  /**
   * Register a handler that can never crash the server: it's rate limited,
   * only ever sees a plain-object payload, and any exception is caught.
   */
  function on(event: string, handler: (payload: Payload, ack: Ack | undefined) => void) {
    socket.on(event, (...args: unknown[]) => {
      const last = args[args.length - 1];
      const ack = typeof last === "function" ? (last as Ack) : undefined;
      const safeAck: Ack | undefined = ack
        ? (response) => {
            try {
              ack(response);
            } catch {
              // ignore
            }
          }
        : undefined;

      if (!eventLimiter.take(socket.id)) {
        droppedEvents += 1;
        if (droppedEvents >= LIMITS.droppedEventsBeforeDisconnect) socket.disconnect(true);
        safeAck?.({ ok: false, error: "Slow down" });
        return;
      }

      const payload = isPlainObject(args[0]) ? args[0] : {};
      try {
        handler(payload, safeAck);
      } catch (error) {
        console.error(`[socket] ${event} failed:`, error);
        safeAck?.({ ok: false, error: "Something went wrong" });
      }
    });
  }

  function fail(ack: Ack | undefined, error: string) {
    ack?.({ ok: false, error });
    socket.emit("game:error", error);
  }

  /** The game this socket has joined and its player id, or null (with an error sent). */
  function requireMember(payload: Payload, ack?: Ack): { gameId: string; state: GameState; playerId: string } | null {
    const gameId = parseGameId(payload.gameId);
    const state = gameId ? games.get(gameId) : undefined;
    if (!gameId || !state) {
      fail(ack, "Game not found");
      return null;
    }
    const playerId = socket.data.playerId as string | undefined;
    if (socket.data.gameId !== gameId || !playerId || !isPlayerInGame(state, playerId)) {
      fail(ack, "Not in this game");
      return null;
    }
    return { gameId, state, playerId };
  }

  function createGame(payload: Payload, ack: Ack | undefined, withBot: boolean) {
    const ip = socket.data.ip as string;
    if (!createLimiter.take(ip)) return fail(ack, "Too many new games. Try again in a minute.");
    if (games.size >= LIMITS.maxActiveGames) return fail(ack, "Server is busy. Try again soon.");
    if (activeGamesFor(ip) >= LIMITS.activeGamesPerIp) return fail(ack, "Too many open games from your network.");

    const gameId = createUniqueGameId();
    const state = createGameState(gameId);
    state.gameMode = parseMode(payload.mode) ?? "CLASSIC";

    if (withBot) {
      const botId = `bot-${crypto.randomUUID()}`;
      state.players.push({
        id: botId,
        name: BOT_NAME,
        hand: [],
        score: 0,
        penaltyPoints: 0,
        currentPosition: "NEUTRAL",
        previousPosition: undefined,
        canCounterTakedown: false,
      });
      botPlayers.set(gameId, botId);
    }

    games.set(gameId, state);
    gameSessions.set(gameId, createGameSessionState(Date.now()));
    gameCreatorIp.set(gameId, ip);
    ack?.({ ok: true, gameId });
  }

  on("game:create", (payload, ack) => createGame(payload, ack, false));
  on("game:createPractice", (payload, ack) => createGame(payload, ack, true));

  on("game:validateJoin", (payload, ack) => {
    if (!joinLimiter.take(socket.data.ip)) return ack?.({ ok: false, error: "Too many attempts. Try again in a minute." });
    const gameId = parseGameId(payload.gameId);
    const state = gameId ? games.get(gameId) : undefined;
    if (!gameId || !state) return ack?.({ ok: false, error: "Game not found" });

    const sessionId = parseSessionId(payload.sessionId);
    if (sessionId && isReconnectableSession(gameId, sessionId)) return ack?.({ ok: true });

    const playerName = parsePlayerName(payload.playerName);
    if (!playerName) return ack?.({ ok: false, error: "Enter a name (up to 20 characters)" });
    const joinError = getJoinError(state, playerName);
    if (joinError) return ack?.({ ok: false, error: joinError });
    ack?.({ ok: true });
  });

  on("game:join", (payload, ack) => {
    if (!joinLimiter.take(socket.data.ip)) return fail(ack, "Too many attempts. Try again in a minute.");
    const gameId = parseGameId(payload.gameId);
    const state = gameId ? games.get(gameId) : undefined;
    if (!gameId || !state) return fail(ack, "Game not found");

    const sessionId = parseSessionId(payload.sessionId);
    const resumePlayerId = sessionId ? getResumePlayerId(gameId, sessionId) : null;

    let playerId: string;
    if (resumePlayerId && isPlayerInGame(state, resumePlayerId)) {
      playerId = resumePlayerId;
    } else {
      const playerName = parsePlayerName(payload.playerName);
      if (!playerName) return fail(ack, "Enter a name (up to 20 characters)");
      const joinError = getJoinError(state, playerName);
      if (joinError) return fail(ack, joinError);

      playerId = crypto.randomUUID();
      state.players.push({
        id: playerId,
        name: playerName,
        hand: [],
        score: 0,
        penaltyPoints: 0,
        currentPosition: "NEUTRAL",
        previousPosition: undefined,
        canCounterTakedown: false,
      });
      if (sessionId) {
        const sessionState = gameSessions.get(gameId) ?? createGameSessionState(Date.now());
        sessionState.sessionToPlayerId.set(sessionId, playerId);
        gameSessions.set(gameId, sessionState);
      }
    }

    if (socket.data.gameId !== gameId) leaveCurrentGame(socket);
    socket.data.playerId = playerId;
    socket.data.gameId = gameId;
    socket.join(gameId);
    markConnected(gameId, socket.id);

    ack?.({ ok: true, playerId, state: playerView(state, playerId) });
    broadcastState(gameId, state);
  });

  /** Apply a game action for the calling player and broadcast on success. */
  function act(payload: Payload, ack: Ack | undefined, buildAction: (playerId: string) => Parameters<typeof applyAction>[1] | null) {
    const member = requireMember(payload, ack);
    if (!member) return;
    const action = buildAction(member.playerId);
    if (!action) return fail(ack, "Invalid move");
    const result = applyAction(member.state, action);
    if (!result.ok) return fail(ack, "error" in result ? result.error : "Invalid move");
    ack?.({ ok: true });
    broadcastState(member.gameId, member.state);
  }

  on("game:setMode", (payload, ack) =>
    act(payload, ack, () => {
      const mode = parseMode(payload.mode);
      return mode ? { type: "SET_MODE", mode } : null;
    }),
  );

  on("game:start", (payload, ack) => {
    const member = requireMember(payload, ack);
    if (!member) return;
    if (member.state.phase !== "LOBBY") return fail(ack, "The game has already started");
    if (member.state.players.length < 2) return fail(ack, "Need 2 players to start");
    member.state.start();
    ack?.({ ok: true });
    broadcastState(member.gameId, member.state);
  });

  on("round:coinWinnerDecision", (payload, ack) =>
    act(payload, ack, (playerId) =>
      typeof payload.deferStartChoice === "boolean" ? { type: "ROUND2_DECISION", playerId, deferStartChoice: payload.deferStartChoice } : null,
    ),
  );

  on("round:startPosition", (payload, ack) =>
    act(payload, ack, (playerId) => {
      const position = parsePosition(payload.position);
      return position ? { type: "ROUND_START_POSITION", playerId, position } : null;
    }),
  );

  on("turn:playCard", (payload, ack) =>
    act(payload, ack, (playerId) => {
      const cardId = parseCardId(payload.cardId);
      return cardId ? { type: "PLAY_CARD", playerId, cardId } : null;
    }),
  );

  on("turn:draw", (payload, ack) => act(payload, ack, (playerId) => ({ type: "DRAW", playerId })));

  on("turn:endOfPeriodPosition", (payload, ack) =>
    act(payload, ack, (playerId) => {
      const position = parsePosition(payload.position);
      return position ? { type: "END_OF_PERIOD_POSITION", playerId, position } : null;
    }),
  );

  on("game:requestRematch", (payload, ack) => act(payload, ack, (playerId) => ({ type: "REQUEST_REMATCH", playerId })));

  on("game:end", (payload, ack) => {
    const member = requireMember(payload, ack);
    if (!member) return;
    io.to(member.gameId).emit("game:ended");
    deleteGame(member.gameId);
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const gameId = socket.data.gameId as string | undefined;
    if (gameId) markDisconnected(gameId, socket.id, Date.now());
  });
});

// Round timers.
setInterval(() => {
  for (const [gameId, state] of games.entries()) {
    try {
      if (tickRoundTimer(state)) broadcastState(gameId, state);
    } catch (error) {
      console.error(`[timer] game ${gameId} failed:`, error);
    }
  }
}, 1000);

// Idle / expired game cleanup and limiter housekeeping.
setInterval(() => {
  const now = Date.now();
  for (const [gameId, sessionState] of gameSessions.entries()) {
    if (shouldCleanupGame(sessionState, now)) {
      io.to(gameId).emit("game:ended");
      deleteGame(gameId);
    }
  }
  for (const limiter of [eventLimiter, createLimiter, joinLimiter, httpLimiter]) limiter.prune(now);
}, CLEANUP_INTERVAL_MS);

server.listen(port, () => {
  console.log(`Server running on :${port}`);
  console.log(`Socket.IO CORS origins: ${Array.isArray(allowedOrigins) ? allowedOrigins.join(", ") : allowedOrigins}`);
  if (LIMIT_SCALE > 1) console.log(`Rate limits scaled x${LIMIT_SCALE} (RATE_LIMIT_MULTIPLIER)`);
});
