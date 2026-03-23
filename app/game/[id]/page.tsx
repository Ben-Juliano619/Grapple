"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Card, Position } from "../../../shared/types";
import { getSocket } from "../../lib/socket";
import { ensureSessionForGame } from "../../lib/session";
import { resetGameSessionState, setActiveGameId } from "../../lib/gameSessionState";
import "./game.css";

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
const WHITE_BUTTON: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #fff",
  background: "#fff",
  fontWeight: 700,
};

function getCardImage(card: Card | null): string {
  if (!card?.imageFile) return BACK_OF_CARD;
  return `/img/cards/${card.imageFile}`;
}

function Modal({ children, zIndex = 30 }: { children: React.ReactNode; zIndex?: number }) {
  return (
    <div className="modal-overlay" style={{ zIndex }}>
      <div className="modal-card">{children}</div>
    </div>
  );
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;

  const socket = useMemo(() => getSocket(), []);
  const [state, setState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isErrorFading, setIsErrorFading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rulesIndex, setRulesIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [hasAcknowledgedMatchResult, setHasAcknowledgedMatchResult] = useState(false);

  useEffect(() => {
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
    state?.isOvertime
      ? "No time limit (Overtime)"
      : roundSecondsLeft === null
        ? "--:--"
        : `${Math.floor(roundSecondsLeft / 60).toString().padStart(2, "0")}:${(roundSecondsLeft % 60).toString().padStart(2, "0")}`;

  const getBannerLabel = (displayPlayerId: string) => {
    if (!state?.playerBanners[displayPlayerId]) return null;
    const banner = `${state.playerBanners[displayPlayerId]} Banner`;

    if (state.phase !== "ENDED" || state.gameResult !== "WIN") return banner;
    if (state.gameWinnerPlayerId === displayPlayerId) return `${banner} - Winner`;
    return `${banner} - Lose`;
  };

  const cardDisabled = !isMyTurn || state?.phase === "LOBBY" || needsEndOfPeriodChoice || pendingRound2Decision || pendingRoundStartPositionChoice;

  function chooseEndOfPeriodPosition(position: Position) {
    socket.emit("turn:endOfPeriodPosition", { gameId, position });
  }

  return (
    <div className="game-page mobile-safe-page">
      <header className="game-header">
        <div className="header-left">
          <h2 style={{ margin: 0 }}>Grapple</h2>
          <p style={{ margin: 0 }}>Game ID: {gameId}</p>
        </div>

        <div className="header-middle">
          {state?.gameMode === "THREE_ROUND" ? (
            <div className="header-pill">
              {state.isOvertime ? "Overtime" : `Round ${state.currentRound}`} {state.gameResult === "DRAW" ? "- Draw" : ""}
            </div>
          ) : null}
          {error ? <div className={`header-pill header-error ${isErrorFading ? "fading" : ""}`}>{error}</div> : null}
        </div>

        <div className="header-right">
          <div>
            <div>{currentPlayer ? `Turn: ${currentPlayer.name}` : "Waiting for players..."}</div>
            {state?.gameMode === "THREE_ROUND" ? <div>Round Timer: {roundTimerLabel}</div> : null}
          </div>
          <button
            onClick={() => {
              setShowRules((value) => {
                const next = !value;
                if (next) setRulesIndex(0);
                return next;
              });
            }}
            className="touch-target"
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #111", background: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            {showRules ? "Hide Rules" : "Rules"}
          </button>
        </div>
      </header>

      {showRules ? (
        <section className="surface rules-section">
          <h3 style={{ margin: 0 }}>Rules Card {rulesIndex + 1} of {RULES_CARDS.length}</h3>
          <Image
            src={RULES_CARDS[rulesIndex]}
            alt={`Rules card ${rulesIndex + 1}`}
            width={600}
            height={860}
            sizes="(max-width: 767px) 92vw, 600px"
            style={{ width: "min(100%, 600px)", height: "auto", borderRadius: 10, border: "1px solid #ccc" }}
          />
          <div className="rules-controls">
            <button
              onClick={() => setRulesIndex((index) => Math.max(0, index - 1))}
              disabled={rulesIndex === 0}
              className="touch-target"
              style={{ ...WHITE_BUTTON, border: "1px solid #111" }}
            >
              ← Previous
            </button>
            <button
              onClick={() => setRulesIndex((index) => Math.min(RULES_CARDS.length - 1, index + 1))}
              disabled={rulesIndex === RULES_CARDS.length - 1}
              className="touch-target"
              style={{ ...WHITE_BUTTON, border: "1px solid #111" }}
            >
              Next →
            </button>
          </div>
        </section>
      ) : null}

      <section className="opponents-wrap">
        <h3 style={{ margin: 0 }}>Opponents</h3>
        <div className="opponents-grid">
          {opponents.length === 0 ? (
            <div>Waiting for opponents to join.</div>
          ) : (
            opponents.map((player) => (
              <div key={player.id} className="surface opponent-card">
                <div style={{ fontWeight: 600 }}>{player.name}</div>
                {state?.gameMode === "THREE_ROUND" && state.playerBanners[player.id] ? (
                  <div style={{ marginTop: 6, display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", background: state.playerBanners[player.id] === "GREEN" ? "#16a34a" : "#dc2626" }}>
                    {getBannerLabel(player.id)}
                  </div>
                ) : null}
                <div style={{ fontSize: 12 }}>Penalties: {player.penaltyPoints}</div>
                <div style={{ fontSize: 12 }}>Position: {positionLabels[player.currentPosition]}</div>
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Array.from({ length: player.hand.length }).map((_, index) => (
                    <Image
                      key={index}
                      src={BACK_OF_CARD}
                      alt="Face down card"
                      width={22}
                      height={32}
                      sizes="22px"
                      style={{ width: 22, height: 32, borderRadius: 4, border: "1px solid #555" }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="draw-area">
        <div className="draw-layout">
          <button
            onClick={() => socket.emit("turn:draw", { gameId })}
            disabled={cardDisabled}
            className="pile-card"
            style={{ borderRadius: 12, background: "#fff", border: "2px solid #111827", fontWeight: 600, overflow: "hidden", padding: 8 }}
          >
            <Image src={BACK_OF_CARD} alt="Draw pile" width={190} height={272} sizes="(max-width: 767px) 50vw, 190px" style={{ width: "100%", height: "auto", borderRadius: 8 }} />
            <div style={{ fontSize: 12, marginTop: 6, color: "#0f172a" }}>{state ? state.drawPile.length : 0} cards</div>
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Discard</div>
            <div className="pile-card">
              <Image
                src={getCardImage(topCard)}
                alt={topCard ? topCard.name : "No card"}
                width={190}
                height={272}
                sizes="(max-width: 767px) 50vw, 190px"
                style={{ width: "100%", height: "auto", borderRadius: 12, border: "2px solid #ccc" }}
              />
            </div>
          </div>
        </div>

        {state?.phase === "LOBBY" ? (
          <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Game mode
              <select
                value={state.gameMode}
                onChange={(e) => socket.emit("game:setMode", { gameId, mode: e.target.value })}
                className="touch-target"
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111" }}
              >
                <option value="CLASSIC">Classic</option>
                <option value="THREE_ROUND">3 two-minute rounds</option>
              </select>
            </label>
            <button
              onClick={() => socket.emit("game:start", { gameId })}
              disabled={!state || state.players.length < 2}
              className="touch-target"
              style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff", fontWeight: 600 }}
            >
              Start Game
            </button>
          </div>
        ) : null}
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <div className="hand-header">
          <h3 style={{ margin: 0 }}>Your Hand {me ? `(${me.hand.length})` : ""}</h3>
          <h3 style={{ margin: 0 }}>Position: {me ? positionLabels[me.currentPosition] : "—"}</h3>
        </div>
        {me ? (
          <>
            {state?.gameMode === "THREE_ROUND" && playerId && state.playerBanners[playerId] ? (
              <div style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", background: state.playerBanners[playerId] === "GREEN" ? "#16a34a" : "#dc2626" }}>
                {getBannerLabel(playerId)}
              </div>
            ) : null}
            <div className="hand-row">
              {me.hand.map((card) => (
                <button
                  key={card.id}
                  onClick={() => socket.emit("turn:playCard", { gameId, cardId: card.id })}
                  disabled={cardDisabled}
                  style={{ borderRadius: 12, border: "2px solid #111", background: "#fff", padding: 0, overflow: "hidden" }}
                >
                  <Image
                    src={getCardImage(card)}
                    alt={card.name}
                    width={190}
                    height={272}
                    sizes="(max-width: 767px) 58vw, (max-width: 1023px) 25vw, 190px"
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
        <Modal zIndex={32}>
          <h3 style={{ margin: 0 }}>Round 2 Coin Flip</h3>
          <p style={{ margin: 0 }}>You won the coin flip. Choose whether to pick the starting position or defer the choice.</p>
          <button onClick={() => socket.emit("round:coinWinnerDecision", { gameId, deferStartChoice: false })} className="touch-target" style={WHITE_BUTTON}>
            I pick the starting position
          </button>
          <button onClick={() => socket.emit("round:coinWinnerDecision", { gameId, deferStartChoice: true })} className="touch-target" style={WHITE_BUTTON}>
            Defer choice to opponent
          </button>
        </Modal>
      ) : null}

      {pendingRoundStartPositionChoice ? (
        <Modal zIndex={33}>
          <h3 style={{ margin: 0 }}>Choose Round Start Position</h3>
          <p style={{ margin: 0 }}>Pick the starting position for this round.</p>
          <button onClick={() => socket.emit("round:startPosition", { gameId, position: "TOP" })} className="touch-target" style={WHITE_BUTTON}>
            Choose Top
          </button>
          <button onClick={() => socket.emit("round:startPosition", { gameId, position: "BOTTOM" })} className="touch-target" style={WHITE_BUTTON}>
            Choose Bottom
          </button>
          <button onClick={() => socket.emit("round:startPosition", { gameId, position: "NEUTRAL" })} className="touch-target" style={WHITE_BUTTON}>
            Choose Neutral
          </button>
        </Modal>
      ) : null}

      {needsMatchResultPopup ? (
        <Modal zIndex={36}>
          <h3 style={{ margin: 0 }}>{matchResultLabel}</h3>
          <button onClick={() => setHasAcknowledgedMatchResult(true)} className="touch-target" style={WHITE_BUTTON}>
            Okay
          </button>
        </Modal>
      ) : null}

      {needsRematchAgreement && hasAcknowledgedMatchResult ? (
        <Modal zIndex={35}>
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
            <button onClick={() => socket.emit("game:requestRematch", { gameId })} disabled={hasVotedForRematch} className="touch-target" style={WHITE_BUTTON}>
              {hasVotedForRematch ? "Waiting for opponent..." : "Rematch"}
            </button>

            <button onClick={() => socket.emit("game:end", { gameId })} className="touch-target" style={WHITE_BUTTON}>
              End Game (Back to Menu)
            </button>
          </div>
        </Modal>
      ) : null}

      {needsEndOfPeriodChoice ? (
        <Modal>
          <h3 style={{ margin: 0 }}>End of Period</h3>
          <p style={{ margin: 0 }}>Choose the position for the next sequence.</p>
          <div style={{ display: "grid", gap: 8 }}>
            <button onClick={() => chooseEndOfPeriodPosition("TOP")} className="touch-target" style={WHITE_BUTTON}>
              Choose Top
            </button>
            <button onClick={() => chooseEndOfPeriodPosition("BOTTOM")} className="touch-target" style={WHITE_BUTTON}>
              Choose Bottom
            </button>
            <button onClick={() => chooseEndOfPeriodPosition("NEUTRAL")} className="touch-target" style={WHITE_BUTTON}>
              Choose Neutral
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
