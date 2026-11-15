"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Card, Position } from "../../shared/types";
import { getSocket } from "../lib/socket";
import { ensureSessionForGame } from "../lib/session";
import { resetGameSessionState, setActiveGameId } from "../lib/gameSessionState";
import WrestlingMat from "./WrestlingMat";
import { resultFeedback, shareGameCode, tapFeedback, turnFeedback } from "../lib/native";

type PlayerState = {
  id: string;
  name: string;
  hand: Card[];
  score: number;
  penaltyPoints: number;
  currentPosition: Position;
  previousPosition?: Position;
};

type GameState = {
  id: string;
  players: PlayerState[];
  drawPile: Card[];
  discardPile: Card[];
  currentTurnIndex: number;
  phase: "LOBBY" | "FIND_START_NEUTRAL" | "PLAY" | "ENDED";
  gameMode: "CLASSIC" | "THREE_ROUND";
  playerBanners: Record<string, "GREEN" | "RED">;
  currentRound: number;
  roundWins: Record<string, number>;
  roundEndsAt?: number;
  round2CoinFlipWinnerPlayerId?: string;
  pendingRound2DecisionPlayerId?: string;
  pendingRound2StartPositionChooserPlayerId?: string;
  pendingRound3StartPositionChooserPlayerId?: string;
  gameWinnerPlayerId?: string;
  gameResult?: "WIN" | "DRAW";
  isOvertime: boolean;
  pendingEndOfPeriodPlayerId?: string;
  rematchVotes: string[];
};

const positionLabels: Record<Position, string> = {
  NEUTRAL: "Neutral",
  TOP: "Top",
  BOTTOM: "Bottom",
};

const BACK_OF_CARD = "/img/cards/back_of_card.png";
const RULES_CARDS = ["/img/cards/rules1.png", "/img/cards/rules2.png", "/img/cards/rules3.png"];

function getCardImage(card: Card | null): string {
  if (!card?.imageFile) return BACK_OF_CARD;
  return `/img/cards/${card.imageFile}`;
}

// Phones get a tighter layout: smaller piles, a swipeable hand and no big
// spacers, so the whole table fits on one screen without scrolling.
function useIsCompact() {
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setIsCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isCompact;
}

export default function GameClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const gameId = searchParams.get("id") ?? "";

  const socket = useMemo(() => getSocket(), []);
  const [state, setState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isErrorFading, setIsErrorFading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rulesIndex, setRulesIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [hasAcknowledgedMatchResult, setHasAcknowledgedMatchResult] = useState(false);
  const isCompact = useIsCompact();
  const [inviteLabel, setInviteLabel] = useState("Invite a friend");

  useEffect(() => {
    if (!gameId) {
      router.replace("/");
      return;
    }
    setActiveGameId(gameId);
    const playerName = window.localStorage.getItem("grapple.playerName") ?? "Player";
    const sessionId = ensureSessionForGame(gameId);

    const onState = (s: GameState) => setState(s);
    const onError = (e: unknown) => setError(String(e));
    const onGameEnded = () => {
      setState(null);
      setHasAcknowledgedMatchResult(false);
      resetGameSessionState();
      router.push("/");
    };

    socket.on("game:state", onState);
    socket.on("game:error", onError);
    socket.on("game:ended", onGameEnded);

    const join = () => {
      socket.emit("game:join", { gameId, playerName, sessionId }, (response: { ok: boolean; error?: string; playerId?: string }) => {
        if (!response.ok) {
          setError(response.error ?? "Unable to join");
          return;
        }
        if (response.playerId) setPlayerId(response.playerId);
      });
    };

    if (socket.connected) join();
    socket.on("connect", join);

    return () => {
      socket.off("game:state", onState);
      socket.off("game:error", onError);
      socket.off("game:ended", onGameEnded);
      socket.off("connect", join);
    };
  }, [socket, gameId, router]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (state?.phase === "ENDED") return;
    setHasAcknowledgedMatchResult(false);
  }, [state?.phase]);

  useEffect(() => {
    if (!error) return;

    setIsErrorFading(false);

    const fadeTimer = window.setTimeout(() => setIsErrorFading(true), 7000);
    const clearTimer = window.setTimeout(() => {
      setError(null);
      setIsErrorFading(false);
    }, 7500);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [error]);

  const me = state?.players.find((player) => player.id === playerId) ?? null;
  const opponents = state?.players.filter((player) => player.id !== playerId) ?? [];
  const currentPlayer = state?.players[state.currentTurnIndex];
  const isMyTurn = Boolean(currentPlayer && currentPlayer.id === playerId);
  const topCard = state?.discardPile[state.discardPile.length - 1] ?? null;
  const cardWidth = isCompact ? "min(30vw, 140px)" : "clamp(124px, 12.5vw, 190px)";
  const handCardWidth = isCompact ? "min(31vw, 150px)" : cardWidth;
  const needsEndOfPeriodChoice = Boolean(state && playerId && state.pendingEndOfPeriodPlayerId === playerId);
  const rematchVotesCount = state?.rematchVotes.length ?? 0;
  const hasVotedForRematch = Boolean(playerId && state?.rematchVotes.includes(playerId));
  const needsRematchAgreement = state?.phase === "ENDED";
  const hasMatchWinner = Boolean(state?.gameResult === "WIN" && state?.gameWinnerPlayerId);
  const isMatchWinner = Boolean(hasMatchWinner && playerId && state?.gameWinnerPlayerId === playerId);
  const matchResultLabel = !hasMatchWinner ? "Match Draw" : isMatchWinner ? "Match Won" : "Match Lost";
  const needsMatchResultPopup = needsRematchAgreement && !hasAcknowledgedMatchResult;
  const pendingRound2Decision = Boolean(state && playerId && state.pendingRound2DecisionPlayerId === playerId);
  const pendingRoundStartPositionChoice = Boolean(
    state &&
      playerId &&
      (state.pendingRound2StartPositionChooserPlayerId === playerId || state.pendingRound3StartPositionChooserPlayerId === playerId),
  );
  const roundSecondsLeft = state?.roundEndsAt ? Math.max(0, Math.ceil((state.roundEndsAt - now) / 1000)) : null;
  const roundTimerLabel =
    state?.isOvertime ? "No time limit (Overtime)" : roundSecondsLeft === null ? "--:--" : `${Math.floor(roundSecondsLeft / 60).toString().padStart(2, "0")}:${(roundSecondsLeft % 60).toString().padStart(2, "0")}`;


  const getBannerLabel = (displayPlayerId: string) => {
    if (!state?.playerBanners[displayPlayerId]) return null;
    const banner = `${state.playerBanners[displayPlayerId]} Banner`;

    if (state.phase !== "ENDED" || state.gameResult !== "WIN") return banner;
    if (state.gameWinnerPlayerId === displayPlayerId) return `${banner} - Winner`;
    return `${banner} - Lose`;
  };

  // Haptic nudge when it becomes your turn, and on the final result.
  const isMyActiveTurn = Boolean(isMyTurn && (state?.phase === "PLAY" || state?.phase === "FIND_START_NEUTRAL"));
  useEffect(() => {
    if (isMyActiveTurn) turnFeedback();
  }, [isMyActiveTurn]);
  useEffect(() => {
    if (needsMatchResultPopup) resultFeedback(isMatchWinner);
  }, [needsMatchResultPopup, isMatchWinner]);

  async function inviteFriend() {
    const result = await shareGameCode(gameId);
    if (result === "copied") {
      setInviteLabel("Code copied!");
      window.setTimeout(() => setInviteLabel("Invite a friend"), 2000);
    }
  }

  function leaveGame() {
    const inProgress = state && state.phase !== "LOBBY" && state.phase !== "ENDED" && opponents.length > 0;
    if (inProgress && !window.confirm("Leave this match? It will end the game for both players.")) return;
    if (state && playerId) socket.emit("game:end", { gameId });
    resetGameSessionState({ clearSessionCookie: true });
    router.push("/");
  }

  const opponent = opponents[0] ?? null;
  const singletColor = (id: string, fallback: string) => {
    const banner = state?.playerBanners[id];
    return banner === "GREEN" ? "#16a34a" : banner === "RED" ? "#dc2626" : fallback;
  };
  const matWrestlers = {
    me: me ? { name: me.name, position: me.currentPosition, color: singletColor(me.id, "#f59e0b") } : null,
    opponent: opponent ? { name: opponent.name, position: opponent.currentPosition, color: singletColor(opponent.id, "#dc2626") } : null,
  };

  function chooseEndOfPeriodPosition(position: Position) {
    socket.emit("turn:endOfPeriodPosition", { gameId, position });
  }

  return (
    <div
      style={{
        boxSizing: "border-box",
        padding: "2px clamp(8px, 1.6vw, 16px) clamp(8px, 1.6vw, 16px)",
        paddingTop: "max(2px, env(safe-area-inset-top))",
        paddingBottom: "max(clamp(8px, 1.6vw, 16px), env(safe-area-inset-bottom))",
        paddingLeft: "max(clamp(8px, 1.6vw, 16px), env(safe-area-inset-left))",
        paddingRight: "max(clamp(8px, 1.6vw, 16px), env(safe-area-inset-right))",
        fontFamily: "system-ui",
        display: "grid",
        gap: 4,
        alignContent: "start",
        minHeight: isCompact ? "100dvh" : "100vh",
        background:
          "radial-gradient(circle at 50% 44%, rgba(196, 38, 38, 0.5) 0%, rgba(196, 38, 38, 0.5) 18%, transparent 19%, transparent 34%, rgba(18, 73, 148, 0.72) 35%, rgba(18, 73, 148, 0.72) 47%, transparent 48%), linear-gradient(180deg, #2d5c96 0%, #1f4170 100%)",
        // iOS Safari ignores fixed backgrounds and the gradient stops short.
        backgroundAttachment: isCompact ? "scroll" : "fixed",
        color: "#f9fbff",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, position: "relative" }}>
        <div style={{ display: "grid", gap: 0, alignContent: "start" }}>
          <h2 style={{ margin: 0, fontSize: isCompact ? "1.25rem" : undefined }}>Grapple</h2>
          <p style={{ margin: 0, fontSize: isCompact ? 13 : undefined }}>Game ID: {gameId}</p>
        </div>
        {state?.gameMode === "THREE_ROUND" && !isCompact ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              transform: "translateX(-50%)",
              display: "grid",
              justifyItems: "center",
            }}
          >
            {state?.gameMode === "THREE_ROUND" ? (
              <div
                style={{
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(255,255,255,0.4)",
                  padding: "4px 10px",
                  color: "#fff",
                  borderRadius: 8,
                  width: "max-content",
                  maxWidth: "min(100%, 560px)",
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 0,
                }}
              >
                {state.isOvertime ? "Overtime" : `Round ${state.currentRound}`} {state.gameResult === "DRAW" ? "- Draw" : ""}
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? (
          // Error toast: fixed to the top of the screen and wraps long messages,
          // so it can never run off the edge (phones, landscape or desktop).
          <div
            role="alert"
            style={{
              position: "fixed",
              left: "50%",
              top: "calc(env(safe-area-inset-top) + 8px)",
              transform: "translateX(-50%)",
              zIndex: 40,
              width: "max-content",
              maxWidth: "min(560px, calc(100vw - 24px))",
              background: "#fee",
              border: "1px solid #f5c2c2",
              padding: "8px 12px",
              color: "#5f0000",
              borderRadius: 8,
              boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
              textAlign: "center",
              whiteSpace: "normal",
              overflowWrap: "anywhere",
              opacity: isErrorFading ? 0 : 1,
              transition: "opacity 500ms ease",
              pointerEvents: "none",
            }}
          >
            {error}
          </div>
        ) : null}
        <div style={{ textAlign: "right", display: "grid", gap: 2, justifyItems: "end" }}>
          <div style={{ fontSize: isCompact ? 13 : undefined }}>
            <div>{currentPlayer ? `Turn: ${currentPlayer.name}` : "Waiting for players..."}</div>
            {state?.gameMode === "THREE_ROUND" ? (
              isCompact ? (
                <div>
                  {state.isOvertime ? "Overtime" : `Round ${state.currentRound}`} · {state.isOvertime ? "No limit" : roundTimerLabel}
                </div>
              ) : (
                <div>Round Timer: {roundTimerLabel}</div>
              )
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={leaveGame}
            style={{
              padding: isCompact ? "6px 10px" : "8px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.7)",
              background: "transparent",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 2,
            }}
          >
            Leave
          </button>
          <button
            onClick={() => {
              setShowRules((value) => {
                const next = !value;
                if (next) {
                  setRulesIndex(0);
                }
                return next;
              });
            }}
            style={{
              padding: isCompact ? "6px 12px" : "8px 14px",
              borderRadius: 8,
              border: "1px solid #111",
              background: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 2,
            }}
          >
            {showRules ? "Hide Rules" : "Rules"}
          </button>
          </div>
        </div>
      </header>

      {showRules ? (
        <section
          style={{
            border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: 12,
            padding: 16,
            background: "rgba(7, 24, 49, 0.7)",
            display: "grid",
            gap: 12,
            justifyItems: "center",
          }}
        >
          <h3 style={{ margin: 0 }}>Rules Card {rulesIndex + 1} of {RULES_CARDS.length}</h3>
          <Image
            src={RULES_CARDS[rulesIndex]}
            alt={`Rules card ${rulesIndex + 1}`}
            width={600}
            height={860}
            style={{ width: "min(100%, 600px)", height: "auto", borderRadius: 10, border: "1px solid #ccc" }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setRulesIndex((index) => Math.max(0, index - 1))}
              disabled={rulesIndex === 0}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #111", background: "#fff", fontWeight: 600 }}
            >
              ← Previous
            </button>
            <button
              onClick={() => setRulesIndex((index) => Math.min(RULES_CARDS.length - 1, index + 1))}
              disabled={rulesIndex === RULES_CARDS.length - 1}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #111", background: "#fff", fontWeight: 600 }}
            >
              Next →
            </button>
          </div>
        </section>
      ) : null}

      <section style={{ display: "grid", gap: 4 }}>
        {isCompact ? null : <h3 style={{ margin: 0 }}>Opponents</h3>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          {opponents.length === 0 ? (
            <div>Waiting for opponents to join.</div>
          ) : (
            opponents.map((player) => (
              <div
                key={player.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.35)",
                  borderRadius: 12,
                  padding: isCompact ? "6px 10px" : "10px 12px 8px",
                  minWidth: isCompact ? 0 : 180,
                  width: isCompact ? "100%" : undefined,
                  boxSizing: "border-box",
                  background: "rgba(7, 24, 49, 0.65)",
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{player.name}</span>
                  {isCompact ? (
                    <span style={{ fontWeight: 400, fontSize: 12 }}>
                      {positionLabels[player.currentPosition]} · Pen {player.penaltyPoints}
                    </span>
                  ) : null}
                </div>
                {state?.gameMode === "THREE_ROUND" && state.playerBanners[player.id] ? (
                  <div style={{ marginTop: isCompact ? 0 : 6, justifySelf: "start", display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", background: state.playerBanners[player.id] === "GREEN" ? "#16a34a" : "#dc2626" }}>
                    {getBannerLabel(player.id)}
                  </div>
                ) : null}
                {isCompact ? null : (
                  <>
                    <div style={{ fontSize: 12 }}>Penalties: {player.penaltyPoints}</div>
                    <div style={{ fontSize: 12 }}>Position: {positionLabels[player.currentPosition]}</div>
                  </>
                )}
                <div style={{ marginTop: isCompact ? 2 : 6, display: "flex", gap: isCompact ? 4 : 6, flexWrap: "wrap" }}>
                  {Array.from({ length: player.hand.length }).map((_, index) => (
                    <Image
                      key={index}
                      src={BACK_OF_CARD}
                      alt="Face down card"
                      width={22}
                      height={32}
                      style={{ width: isCompact ? 14 : 22, height: isCompact ? 20 : 32, borderRadius: isCompact ? 2 : 4, border: "1px solid #555" }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {matWrestlers.me && matWrestlers.opponent ? (
        <section style={{ marginTop: isCompact ? 2 : "clamp(4px, 1.5vh, 20px)" }}>
          <WrestlingMat me={matWrestlers.me} opponent={matWrestlers.opponent} height={isCompact ? 72 : 110} />
        </section>
      ) : null}

      <section style={{ display: "grid", placeItems: "center", gap: 4, marginTop: isCompact ? 4 : matWrestlers.opponent ? 8 : "clamp(36px, 11vh, 150px)" }}>
        <div
          style={{
            display: "flex",
            gap: isCompact ? 14 : "clamp(16px, 2.8vw, 40px)",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "center",
            width: "100%",
          }}
        >
          <button
            onClick={() => {
              tapFeedback();
              socket.emit("turn:draw", { gameId });
            }}
            disabled={!state || !isMyTurn || state.phase === "LOBBY" || needsEndOfPeriodChoice || pendingRound2Decision || pendingRoundStartPositionChoice}
            style={{
              width: cardWidth,
              borderRadius: 12,
              background: "#fff",
              border: "2px solid #111827",
              fontWeight: 600,
              overflow: "hidden",
              padding: isCompact ? 4 : 8,
            }}
          >
            <Image src={BACK_OF_CARD} alt="Draw pile" width={190} height={272} style={{ width: "100%", height: "auto", borderRadius: 8 }} />
            <div style={{ fontSize: isCompact ? 11 : 12, marginTop: isCompact ? 2 : 6 }}>{state ? state.drawPile.length : 0} cards</div>
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: isCompact ? 2 : 6, fontWeight: 600, fontSize: isCompact ? 13 : undefined }}>Discard</div>
            <div style={{ width: cardWidth }}>
              <Image
                src={getCardImage(topCard)}
                alt={topCard ? topCard.name : "No card"}
                width={190}
                height={272}
                style={{ width: "100%", height: "auto", borderRadius: 12, border: "2px solid #ccc" }}
              />
            </div>
          </div>
        </div>

        {state?.phase === "LOBBY" ? (
          <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
            {opponents.length === 0 ? (
              <button
                onClick={() => void inviteFriend()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "1px solid #fff",
                  background: "#fff",
                  color: "#0b1f3d",
                  fontWeight: 700,
                }}
              >
                {inviteLabel} · {gameId}
              </button>
            ) : null}
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Game mode
              <select
                value={state.gameMode}
                onChange={(e) => socket.emit("game:setMode", { gameId, mode: e.target.value })}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111" }}
              >
                <option value="CLASSIC">Classic</option>
                <option value="THREE_ROUND">3 two-minute rounds</option>
              </select>
            </label>
            <button
              onClick={() => socket.emit("game:start", { gameId })}
              disabled={!state || state.players.length < 2}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              Start Game
            </button>
          </div>
        ) : null}
      </section>

      <section style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: isCompact ? 15 : undefined }}>Your Hand {me ? `(${me.hand.length})` : ""}</h3>
          <h3 style={{ margin: 0, fontSize: isCompact ? 15 : undefined }}>Position: {me ? positionLabels[me.currentPosition] : "—"}</h3>
        </div>
        {me ? (
          <>
            {state?.gameMode === "THREE_ROUND" && playerId && state.playerBanners[playerId] ? (
              <div style={{ justifySelf: "start", display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", background: state.playerBanners[playerId] === "GREEN" ? "#16a34a" : "#dc2626" }}>
                {getBannerLabel(playerId)}
              </div>
            ) : null}
            <div
              style={
                isCompact
                  ? {
                      // Swipeable single row so the whole hand stays on screen.
                      display: "flex",
                      gap: 8,
                      overflowX: "auto",
                      scrollSnapType: "x mandatory",
                      WebkitOverflowScrolling: "touch",
                      paddingBottom: 6,
                      width: "100%",
                    }
                  : { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(clamp(124px, 12.5vw, 190px), 1fr))", width: "100%" }
              }
            >
            {me.hand.map((card) => (
              <button
                key={card.id}
                onClick={() => {
                  tapFeedback();
                  socket.emit("turn:playCard", { gameId, cardId: card.id });
                }}
                disabled={!isMyTurn || state?.phase === "LOBBY" || needsEndOfPeriodChoice || pendingRound2Decision || pendingRoundStartPositionChoice}
                style={{
                  width: isCompact ? handCardWidth : "100%",
                  maxWidth: handCardWidth,
                  flex: isCompact ? "0 0 auto" : undefined,
                  scrollSnapAlign: isCompact ? "start" : undefined,
                  borderRadius: isCompact ? 8 : 12,
                  border: "2px solid #111",
                  background: "#fff",
                  padding: 0,
                  overflow: "hidden",
                }}
              >
                <Image
                  src={getCardImage(card)}
                  alt={card.name}
                  width={190}
                  height={272}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </button>
            ))}
            </div>
          </>
        ) : (
          <div>Joining game…</div>
        )}
      </section>

      {pendingRound2Decision ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.58)", display: "grid", placeItems: "center", zIndex: 32, padding: 16 }}>
          <div style={{ width: "min(92vw, 480px)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.4)", background: "#0b1f3d", padding: 18, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Round 2 Coin Flip</h3>
            <p style={{ margin: 0 }}>You won the coin flip. Choose whether to pick the starting position or defer the choice.</p>
            <button onClick={() => socket.emit("round:coinWinnerDecision", { gameId, deferStartChoice: false })} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}>
              I pick the starting position
            </button>
            <button onClick={() => socket.emit("round:coinWinnerDecision", { gameId, deferStartChoice: true })} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}>
              Defer choice to opponent
            </button>
          </div>
        </div>
      ) : null}

      {pendingRoundStartPositionChoice ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.58)", display: "grid", placeItems: "center", zIndex: 33, padding: 16 }}>
          <div style={{ width: "min(92vw, 480px)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.4)", background: "#0b1f3d", padding: 18, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Choose Round Start Position</h3>
            <p style={{ margin: 0 }}>Pick the starting position for this round.</p>
            <button onClick={() => socket.emit("round:startPosition", { gameId, position: "TOP" })} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}>
              Choose Top
            </button>
            <button onClick={() => socket.emit("round:startPosition", { gameId, position: "BOTTOM" })} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}>
              Choose Bottom
            </button>
            <button onClick={() => socket.emit("round:startPosition", { gameId, position: "NEUTRAL" })} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}>
              Choose Neutral
            </button>
          </div>
        </div>
      ) : null}

      {needsMatchResultPopup ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.58)",
            display: "grid",
            placeItems: "center",
            zIndex: 36,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(92vw, 420px)",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.4)",
              background: "#0b1f3d",
              padding: 18,
              display: "grid",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>{matchResultLabel}</h3>
            <button
              onClick={() => setHasAcknowledgedMatchResult(true)}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}
            >
              Okay
            </button>
          </div>
        </div>
      ) : null}

      {needsRematchAgreement && hasAcknowledgedMatchResult ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.58)",
            display: "grid",
            placeItems: "center",
            zIndex: 35,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(92vw, 520px)",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.4)",
              background: "#0b1f3d",
              padding: 18,
              display: "grid",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>Game Over</h3>
            {state?.gameMode === "THREE_ROUND" ? <p style={{ margin: 0 }}>Round wins: {state.players.map((p) => `${p.name} ${state.roundWins[p.id] ?? 0}`).join(" • ")}</p> : null}
            {state?.isOvertime ? <p style={{ margin: 0 }}>Overtime active: first pin or player to use all cards wins the game.</p> : null}
            <p style={{ margin: 0 }}>Do both players want a rematch?</p>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Rematch agreement</div>
              <div style={{ width: "100%", height: 12, borderRadius: 999, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.min(100, (rematchVotesCount / 2) * 100)}%`,
                    height: "100%",
                    background: "#3bd37f",
                    transition: "width 150ms ease",
                  }}
                />
              </div>
              <div style={{ fontWeight: 700 }}>{Math.min(rematchVotesCount, 2)}/2</div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <button
                onClick={() => socket.emit("game:requestRematch", { gameId })}
                disabled={hasVotedForRematch}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}
              >
                {hasVotedForRematch ? "Waiting for opponent..." : "Rematch"}
              </button>

              <button
                onClick={() => {
                  socket.emit("game:end", { gameId });
                }}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}
              >
                End Game (Back to Menu)
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {needsEndOfPeriodChoice ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.58)",
            display: "grid",
            placeItems: "center",
            zIndex: 30,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(92vw, 480px)",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.4)",
              background: "#0b1f3d",
              padding: 18,
              display: "grid",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>End of Period</h3>
            <p style={{ margin: 0 }}>Choose the position for the next sequence.</p>
            <div style={{ display: "grid", gap: 8 }}>
              <button
                onClick={() => chooseEndOfPeriodPosition("TOP")}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}
              >
                Choose Top
              </button>
              <button
                onClick={() => chooseEndOfPeriodPosition("BOTTOM")}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}
              >
                Choose Bottom
              </button>
              <button
                onClick={() => chooseEndOfPeriodPosition("NEUTRAL")}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", fontWeight: 700 }}
              >
                Choose Neutral
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
