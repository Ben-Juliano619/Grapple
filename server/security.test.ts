// Security tests: start the real server and attack it with scripted clients.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { io, type Socket } from "socket.io-client";
import { RateLimiter, clientIp, parsePlayerName, playerView } from "./security";
import { createGameState } from "./logic";

const PORT = 39000 + Math.floor(Math.random() * 1000);
const URL = `http://localhost:${PORT}`;
let server: ChildProcess;
const sockets: Socket[] = [];

before(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    // TRUST_PROXY lets each test act as a different client IP via X-Forwarded-For,
    // like requests arriving through Railway's proxy.
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", TRUST_PROXY: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 15000);
    server.stdout!.on("data", (chunk) => {
      if (String(chunk).includes("Server running")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
});

after(() => {
  for (const socket of sockets) socket.disconnect();
  server.kill();
});

let ipCounter = 0;
/** Each test file section gets its own fake client IP unless one is given. */
async function connect(ip = `203.0.113.${++ipCounter}`): Promise<Socket> {
  const socket = io(URL, { transports: ["websocket"], reconnection: false, forceNew: true, extraHeaders: { "x-forwarded-for": ip } });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

function request<T = { ok: boolean; error?: string; gameId?: string; playerId?: string; state?: any }>(
  socket: Socket,
  event: string,
  payload?: unknown,
): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, (response: T) => resolve(response)));
}

/** Resolve with the first game:state that matches (e.g. once the game has started). */
const nextState = (socket: Socket, matches: (state: any) => boolean = () => true) =>
  new Promise<any>((resolve) => {
    const listener = (state: any) => {
      if (!matches(state)) return;
      socket.off("game:state", listener);
      resolve(state);
    };
    socket.on("game:state", listener);
  });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function serverAlive() {
  const response = await fetch(`${URL}/api/session/validate?gameId=123456&sessionId=abcdefgh`);
  return response.status === 200;
}

/** Two players in a started game. */
async function startedGame() {
  const ip = `198.51.100.${++ipCounter}`;
  const a = await connect(ip);
  const b = await connect(ip);
  const { gameId } = await request(a, "game:create", {});
  const joinedA = await request(a, "game:join", { gameId, playerName: "Alice", sessionId: "session-a-" + Date.now() });
  const joinedB = await request(b, "game:join", { gameId, playerName: "Bob", sessionId: "session-b-" + Date.now() });
  const stateA = nextState(a, (state) => state.phase !== "LOBBY");
  const stateB = nextState(b, (state) => state.phase !== "LOBBY");
  assert.equal((await request(a, "game:start", { gameId })).ok, true);
  return { a, b, gameId: gameId!, aId: joinedA.playerId!, bId: joinedB.playerId!, stateA: await stateA, stateB: await stateB };
}

// ---------- Crash resistance ----------

test("malformed messages can't crash the server", async () => {
  const socket = await connect();
  const junk: unknown[] = [null, undefined, 42, "x", [], [1, 2], true, { gameId: null }, { gameId: { $gt: "" } }, { gameId: "1".repeat(5000) }, { playerName: 12 }];
  const events = ["game:join", "game:validateJoin", "game:create", "game:start", "game:setMode", "turn:playCard", "turn:draw", "turn:endOfPeriodPosition", "round:coinWinnerDecision", "round:startPosition", "game:requestRematch", "game:end"];
  for (const event of events) {
    for (const payload of junk) socket.emit(event, payload);
    socket.emit(event); // no payload at all
  }
  await sleep(500);
  assert.ok(await serverAlive(), "server still answers after junk messages");
});

test("oversized messages are refused", async () => {
  const socket = await connect();
  const disconnected = new Promise((resolve) => socket.once("disconnect", resolve));
  socket.emit("game:join", { gameId: "123456", playerName: "x".repeat(20_000) });
  await disconnected;
  assert.ok(await serverAlive());
});

// ---------- Hidden information ----------

test("players only receive their own hand; opponent hand and deck order stay hidden", async () => {
  const { aId, bId, stateA, stateB } = await startedGame();
  const meA = stateA.players.find((p: any) => p.id === aId);
  const oppA = stateA.players.find((p: any) => p.id === bId);
  assert.equal(meA.hand.length, 5);
  assert.equal(oppA.hand.length, 0, "opponent's cards are not sent");
  assert.equal(oppA.handCount, 5, "only the count is sent");
  assert.equal(stateA.drawPile, undefined, "draw pile order is not sent");
  assert.equal(stateA.drawPileCount, 40);
  assert.equal(stateB.players.find((p: any) => p.id === aId).hand.length, 0);
});

// ---------- Authorization ----------

test("someone not in the game can't start, change, play in, or end it", async () => {
  const { gameId, a } = await startedGame();
  const outsider = await connect();
  for (const [event, payload] of [
    ["game:start", { gameId }],
    ["game:setMode", { gameId, mode: "THREE_ROUND" }],
    ["turn:draw", { gameId }],
    ["turn:playCard", { gameId, cardId: "anything" }],
    ["game:end", { gameId }],
    ["game:requestRematch", { gameId }],
  ] as const) {
    const response = await request(outsider, event, payload);
    assert.equal(response.ok, false, `${event} must be refused`);
    assert.equal(response.error, "Not in this game");
  }
  // The game is untouched: a player can still act in it.
  const stillThere = await request(a, "game:setMode", { gameId, mode: "CLASSIC" });
  assert.equal(stillThere.error, "Mode can only be changed in the lobby");
});

test("a game in progress can't be restarted", async () => {
  const { gameId, a } = await startedGame();
  const response = await request(a, "game:start", { gameId });
  assert.equal(response.ok, false);
  assert.equal(response.error, "The game has already started");
});

test("a full game can't be joined", async () => {
  const { gameId } = await startedGame();
  const third = await connect();
  const response = await request(third, "game:join", { gameId, playerName: "Mallory" });
  assert.equal(response.ok, false);
  assert.equal(response.error, "Game is full");
});

// ---------- Rate limits ----------

test("creating games is rate limited per IP", async () => {
  const socket = await connect();
  const results = [];
  for (let i = 0; i < 25; i += 1) results.push(await request(socket, "game:create", {}));
  assert.ok(results.some((r) => !r.ok), "some creations are refused");
  assert.ok(await serverAlive());
});

test("message floods are throttled and the connection is dropped", async () => {
  const socket = await connect();
  const disconnected = new Promise((resolve) => socket.once("disconnect", resolve));
  for (let i = 0; i < 400; i += 1) socket.emit("turn:draw", { gameId: "123456" });
  await disconnected;
  assert.ok(await serverAlive());
});

// ---------- Unit checks ----------

test("player names are cleaned and length-limited", () => {
  assert.equal(parsePlayerName("  Ben  "), "Ben");
  assert.equal(parsePlayerName("Be‮n"), "Ben", "bidi override removed");
  assert.equal(parsePlayerName("a".repeat(21)), null);
  assert.equal(parsePlayerName("   "), null);
  assert.equal(parsePlayerName(5), null);
});

test("client IP uses the proxy's entry, not a spoofed one", () => {
  assert.equal(clientIp({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }, "10.0.0.1", true), "1.2.3.4");
  assert.equal(clientIp({ "x-forwarded-for": "6.6.6.6" }, "10.0.0.1", false), "10.0.0.1");
});

test("rate limiter refills over time", () => {
  const limiter = new RateLimiter(2, 1);
  assert.ok(limiter.take("k", 0));
  assert.ok(limiter.take("k", 0));
  assert.equal(limiter.take("k", 0), false);
  assert.ok(limiter.take("k", 1000));
});

test("playerView never includes another player's hand", () => {
  const state = createGameState("123456");
  for (const id of ["a", "b"]) {
    state.players.push({ id, name: id, hand: [], score: 0, penaltyPoints: 0, currentPosition: "NEUTRAL", canCounterTakedown: false });
  }
  state.start();
  const view = playerView(state, "a");
  assert.equal(view.players.find((p) => p.id === "b")!.hand.length, 0);
  assert.equal(JSON.stringify(view).includes(state.players[1].hand[0].id), false);
  assert.equal("drawPile" in view, false);
});
