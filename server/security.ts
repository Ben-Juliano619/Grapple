// server/security.ts
// Input validation, rate limiting and per-player game views for the socket server.
import type { Position } from "../shared/types";
import type { GameState } from "./logic";

// ---------- Input validation ----------
// Everything that arrives over the socket is untrusted: check shape and size
// before it touches game state.

export const MAX_NAME_LENGTH = 20;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGameId(value: unknown): string | null {
  return typeof value === "string" && /^\d{6}$/.test(value) ? value : null;
}

// Control characters, zero-width and bidi-override characters can't be used to
// spoof or break other players' screens.
const UNSAFE_NAME_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2069\\ufeff]", "g");

export function parsePlayerName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  const cleaned = value.normalize("NFKC").replace(UNSAFE_NAME_CHARS, "").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > MAX_NAME_LENGTH) return null;
  return cleaned;
}

export function parseSessionId(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : undefined;
}

export function parseCardId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null;
}

export function parsePosition(value: unknown): Position | null {
  return value === "TOP" || value === "BOTTOM" || value === "NEUTRAL" ? value : null;
}

export function parseMode(value: unknown): GameState["gameMode"] | null {
  return value === "CLASSIC" || value === "THREE_ROUND" ? value : null;
}

// ---------- Rate limiting ----------

/** Token bucket per key (socket id or IP address). */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    bucket.tokens = Math.min(this.capacity, bucket.tokens + ((now - bucket.updatedAt) / 1000) * this.refillPerSecond);
    bucket.updatedAt = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  /** Forget keys that have fully refilled (call periodically). */
  prune(now = Date.now()) {
    for (const [key, bucket] of this.buckets) {
      const refilled = bucket.tokens + ((now - bucket.updatedAt) / 1000) * this.refillPerSecond;
      if (refilled >= this.capacity) this.buckets.delete(key);
    }
  }
}

/**
 * Client IP for rate limiting. Behind a proxy (Railway), use the LAST
 * X-Forwarded-For entry: that's the one the proxy added. Earlier entries are
 * whatever the client sent and can be faked.
 */
export function clientIp(headers: Record<string, string | string[] | undefined>, socketAddress: string | undefined, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = headers["x-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded[forwarded.length - 1] : forwarded;
    const last = value?.split(",").pop()?.trim();
    if (last) return last;
  }
  return socketAddress ?? "unknown";
}

// ---------- What each player is allowed to see ----------

/**
 * The game as one player may see it: their own hand, but only card COUNTS for
 * the opponent's hand and the draw pile, and only the last played card.
 * Never send the full state: anyone can read socket messages in dev tools.
 */
export function playerView(state: GameState, viewerId: string | undefined) {
  const topCard = state.discardPile[state.discardPile.length - 1];
  return {
    id: state.id,
    phase: state.phase,
    gameMode: state.gameMode,
    currentTurnIndex: state.currentTurnIndex,
    playerBanners: state.playerBanners,
    currentRound: state.currentRound,
    roundWins: state.roundWins,
    roundEndsAt: state.roundEndsAt,
    round2CoinFlipWinnerPlayerId: state.round2CoinFlipWinnerPlayerId,
    pendingRound2DecisionPlayerId: state.pendingRound2DecisionPlayerId,
    pendingRound2StartPositionChooserPlayerId: state.pendingRound2StartPositionChooserPlayerId,
    pendingRound3StartPositionChooserPlayerId: state.pendingRound3StartPositionChooserPlayerId,
    gameWinnerPlayerId: state.gameWinnerPlayerId,
    gameResult: state.gameResult,
    isOvertime: state.isOvertime,
    pendingEndOfPeriodPlayerId: state.pendingEndOfPeriodPlayerId,
    rematchVotes: state.rematchVotes,
    drawPileCount: state.drawPile.length,
    discardPile: topCard ? [topCard] : [],
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      penaltyPoints: player.penaltyPoints,
      currentPosition: player.currentPosition,
      handCount: player.hand.length,
      hand: player.id === viewerId ? player.hand : [],
    })),
  };
}

export type PlayerView = ReturnType<typeof playerView>;
