"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Card, Position } from "../../shared/types";
import { getSocket } from "../lib/socket";
import { ensureSessionForGame } from "../lib/session";
import { resetGameSessionState, setActiveGameId } from "../lib/gameSessionState";
import WrestlingMat from "./WrestlingMat";
import styles from "./game.module.css";
import { resultFeedback, shareGameCode, tapFeedback, turnFeedback } from "../lib/native";

type PlayerState = {
  id: string;
  name: string;
  // Only your own hand is sent; for the opponent the server sends just the count.
  hand: Card[];
  handCount: number;
  score: number;
  penaltyPoints: number;
  currentPosition: Position;
};

type GameState = {
  id: string;
  players: PlayerState[];
  drawPileCount: number;
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

const BACK_OF_CARD = "/img/cards/back_of_card.png";
const RULES_CARDS = ["/img/cards/rules1.png", "/img/cards/rules2.png", "/img/cards/rules3.png"];

// Server messages say e.g. "TOP position"; show positions the way players say them.
function friendlyError(message: string): string {
  return message.replace(/\b(TOP|BOTTOM|NEUTRAL)\b/g, (word) => word[0] + word.slice(1).toLowerCase());
}

function getCardImage(card: Card | null): string {
  if (!card?.imageFile) return BACK_OF_CARD;
  return `/img/cards/${card.imageFile}`;
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
  const [errorCount, setErrorCount] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [rulesIndex, setRulesIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [hasAcknowledgedMatchResult, setHasAcknowledgedMatchResult] = useState(false);
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
    const onError = (e: unknown) => {
      setError(friendlyError(String(e)));
      setErrorCount((count) => count + 1);
    };
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

    const fadeTimer = window.setTimeout(() => setIsErrorFading(true), 3500);
    const clearTimer = window.setTimeout(() => {
      setError(null);
      setIsErrorFading(false);
    }, 4000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [error, errorCount]);

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
    roundSecondsLeft === null ? "--:--" : `${Math.floor(roundSecondsLeft / 60).toString().padStart(2, "0")}:${(roundSecondsLeft % 60).toString().padStart(2, "0")}`;


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

  const isLobby = state?.phase === "LOBBY";
  const showHandTray = Boolean(me && !isLobby);
  const isPlaying = state?.phase === "PLAY" || state?.phase === "FIND_START_NEUTRAL";
  const waitingOnChoice = needsEndOfPeriodChoice || pendingRound2Decision || pendingRoundStartPositionChoice;
  const canAct = Boolean(isPlaying && isMyTurn && !waitingOnChoice);
  const myColor = matWrestlers.me?.color ?? "#f59e0b";
  const opponentColor = matWrestlers.opponent?.color ?? "#dc2626";

  // One clear line of status in the top bar instead of scattered labels.
  let statusText = "Connecting…";
  if (state) {
    if (isLobby) statusText = opponent ? "Ready to start" : "Waiting…";
    else if (state.phase === "ENDED") statusText = matchResultLabel;
    else if (waitingOnChoice) statusText = "Your choice";
    else if (isMyTurn) statusText = "Your turn";
    else if (currentPlayer) statusText = `${currentPlayer.name}'s turn`;
  }
  const statusIsMine = Boolean(state && !isLobby && state.phase !== "ENDED" && (isMyTurn || waitingOnChoice));
  const roundLine =
    state?.gameMode === "THREE_ROUND" && !isLobby && state.phase !== "ENDED"
      ? state.isOvertime
        ? `Overtime · ${roundTimerLabel}`
        : `Round ${state.currentRound} · ${roundTimerLabel}`
      : null;
  const handHint =
    state?.phase === "FIND_START_NEUTRAL" && isMyTurn
      ? "Play a Neutral card"
      : canAct
        ? "Tap a card to play"
        : null;

  const bannerBadge = (id: string) => {
    const banner = state?.playerBanners[id];
    if (!banner || state?.gameMode !== "THREE_ROUND") return null;
    return <span className={`${styles.badge} ${banner === "GREEN" ? styles.badgeGreen : styles.badgeRed}`}>{banner === "GREEN" ? "Green" : "Red"}</span>;
  };

  const positionButtons = (onChoose: (position: Position) => void) => (
    <>
      <button className={`${styles.btn} ${styles.btnLight}`} onClick={() => onChoose("TOP")}>
        Top
      </button>
      <button className={`${styles.btn} ${styles.btnLight}`} onClick={() => onChoose("BOTTOM")}>
        Bottom
      </button>
      <button className={`${styles.btn} ${styles.btnLight}`} onClick={() => onChoose("NEUTRAL")}>
        Neutral
      </button>
    </>
  );

  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <div className={styles.barLeft}>
          <button className={styles.barButton} onClick={leaveGame}>
            ‹ Leave
          </button>
        </div>
        <div className={styles.status}>
          <div className={`${styles.pill} ${statusIsMine ? styles.pillActive : ""}`}>{statusText}</div>
          {roundLine ? <div className={styles.subStatus}>{roundLine}</div> : null}
        </div>
        <div className={styles.barRight}>
          <button
            className={styles.barButton}
            onClick={() => {
              setRulesIndex(0);
              setShowRules(true);
            }}
          >
            Rules
          </button>
        </div>
      </header>

      <main className={styles.content}>
        {opponent ? (
          <div className={styles.opponentRow}>
            <div className={styles.who}>
              <span className={styles.dot} style={{ background: opponentColor }} />
              <span className={styles.whoName}>{opponent.name}</span>
              {bannerBadge(opponent.id)}
            </div>
            {!isLobby ? (
              <div className={styles.meta}>
                {opponent.penaltyPoints > 0 ? <span className={`${styles.badge} ${styles.badgeWarn}`}>Penalty {opponent.penaltyPoints}</span> : null}
                <span>
                  {opponent.handCount} {opponent.handCount === 1 ? "card" : "cards"}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {matWrestlers.me && matWrestlers.opponent ? (
          <WrestlingMat me={matWrestlers.me} opponent={matWrestlers.opponent} className={styles.mat} svgClassName={styles.matSvg} />
        ) : null}

        {isLobby ? (
          <section className={styles.lobbyCard}>
            {opponent ? (
              <h2 className={styles.lobbyTitle}>{opponent.name} is ready</h2>
            ) : (
              <>
                <h2 className={styles.lobbyTitle}>Waiting for an opponent</h2>
                <div className={styles.label}>Game code</div>
                <div className={styles.code}>{gameId}</div>
                <button className={`${styles.btn} ${styles.btnLight}`} onClick={() => void inviteFriend()}>
                  {inviteLabel}
                </button>
              </>
            )}
            <div className={styles.label}>Game mode</div>
            <div className={styles.segmented} role="radiogroup" aria-label="Game mode">
              {(
                [
                  ["CLASSIC", "Classic"],
                  ["THREE_ROUND", "3 Rounds"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  role="radio"
                  aria-checked={state?.gameMode === mode}
                  className={`${styles.segment} ${state?.gameMode === mode ? styles.segmentOn : ""}`}
                  onClick={() => socket.emit("game:setMode", { gameId, mode })}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => socket.emit("game:start", { gameId })}
              disabled={!state || state.players.length < 2}
            >
              Start Game
            </button>
          </section>
        ) : state ? (
          <section className={styles.piles}>
            <div>
              <button
                className={`${styles.pile} ${styles.pileButton}`}
                onClick={() => {
                  tapFeedback();
                  socket.emit("turn:draw", { gameId });
                }}
                disabled={!canAct}
                aria-label={`Draw a card (${state.drawPileCount} left)`}
              >
                <Image src={BACK_OF_CARD} alt="Draw pile" width={190} height={262} loading="eager" />
                <span className={styles.pileCount}>{state.drawPileCount}</span>
              </button>
              <div className={styles.pileLabel}>Draw</div>
            </div>
            <div>
              <div className={`${styles.pile} ${styles.discard}`}>
                <Image src={getCardImage(topCard)} alt={topCard ? `Last played: ${topCard.name}` : "No card played yet"} width={190} height={262} loading="eager" />
              </div>
              <div className={styles.pileLabel}>Last played</div>
            </div>
          </section>
        ) : null}

        {showHandTray && me ? (
          <section className={`${styles.handTray} ${canAct ? styles.handTrayActive : ""}`}>
            {error ? (
              // Shown right above your cards, where you just tapped.
              <div role="alert" key={errorCount} className={`${styles.toast} ${styles.toastAboveHand}`} style={{ opacity: isErrorFading ? 0 : 1 }}>
                {error}
              </div>
            ) : null}
            <div className={styles.handHeader}>
              <div className={styles.who}>
                <span className={styles.dot} style={{ background: myColor }} />
                <span>Your hand · {me.hand.length}</span>
                {bannerBadge(me.id)}
                {me.penaltyPoints > 0 ? <span className={`${styles.badge} ${styles.badgeWarn}`}>Penalty {me.penaltyPoints}</span> : null}
              </div>
              {handHint ? <div className={styles.hint}>{handHint}</div> : null}
            </div>
            <div className={styles.hand}>
              {me.hand.map((card) => (
                <button
                  key={card.id}
                  className={styles.handCard}
                  onClick={() => {
                    tapFeedback();
                    socket.emit("turn:playCard", { gameId, cardId: card.id });
                  }}
                  disabled={!canAct}
                >
                  <Image src={getCardImage(card)} alt={card.name} width={190} height={262} loading="eager" />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {!me && state ? <p style={{ textAlign: "center", opacity: 0.8 }}>Joining game…</p> : null}
      </main>

      {error && !showHandTray ? (
        <div role="alert" className={`${styles.toast} ${styles.toastTop}`} style={{ opacity: isErrorFading ? 0 : 1 }}>
          {error}
        </div>
      ) : null}

      {showRules ? (
        <div className={styles.overlay} onClick={() => setShowRules(false)}>
          <div className={`${styles.sheet} ${styles.sheetWide}`} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.sheetTitle}>How to play</h3>
            <Image
              className={styles.rulesImage}
              src={RULES_CARDS[rulesIndex]}
              alt={`Rules card ${rulesIndex + 1}`}
              width={600}
              height={830}
            />
            <div className={styles.rulesNav}>
              <button className={styles.btn} onClick={() => setRulesIndex((index) => Math.max(0, index - 1))} disabled={rulesIndex === 0}>
                ← Back
              </button>
              <span className={styles.subStatus}>
                {rulesIndex + 1} / {RULES_CARDS.length}
              </span>
              <button
                className={styles.btn}
                onClick={() => setRulesIndex((index) => Math.min(RULES_CARDS.length - 1, index + 1))}
                disabled={rulesIndex === RULES_CARDS.length - 1}
              >
                Next →
              </button>
            </div>
            <button className={`${styles.btn} ${styles.btnLight}`} onClick={() => setShowRules(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      {pendingRound2Decision ? (
        <div className={styles.overlay}>
          <div className={styles.sheet}>
            <h3 className={styles.sheetTitle}>You won the coin flip</h3>
            <p className={styles.sheetText}>Pick the starting position for round 2, or let your opponent choose.</p>
            <button className={`${styles.btn} ${styles.btnLight}`} onClick={() => socket.emit("round:coinWinnerDecision", { gameId, deferStartChoice: false })}>
              I&apos;ll pick
            </button>
            <button className={styles.btn} onClick={() => socket.emit("round:coinWinnerDecision", { gameId, deferStartChoice: true })}>
              Defer to opponent
            </button>
          </div>
        </div>
      ) : null}

      {pendingRoundStartPositionChoice ? (
        <div className={styles.overlay}>
          <div className={styles.sheet}>
            <h3 className={styles.sheetTitle}>Choose your starting position</h3>
            <p className={styles.sheetText}>Where do you want to start this round?</p>
            {positionButtons((position) => socket.emit("round:startPosition", { gameId, position }))}
          </div>
        </div>
      ) : null}

      {needsEndOfPeriodChoice ? (
        <div className={styles.overlay}>
          <div className={styles.sheet}>
            <h3 className={styles.sheetTitle}>End of period</h3>
            <p className={styles.sheetText}>Choose your position for the next period.</p>
            {positionButtons(chooseEndOfPeriodPosition)}
          </div>
        </div>
      ) : null}

      {needsMatchResultPopup ? (
        <div className={styles.overlay}>
          <div className={styles.sheet}>
            <h3 className={styles.sheetTitle}>{matchResultLabel}</h3>
            {state?.gameMode === "THREE_ROUND" ? (
              <p className={styles.sheetText}>Round wins: {state.players.map((p) => `${p.name} ${state.roundWins[p.id] ?? 0}`).join(" · ")}</p>
            ) : null}
            <button className={`${styles.btn} ${styles.btnLight}`} onClick={() => setHasAcknowledgedMatchResult(true)}>
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {needsRematchAgreement && hasAcknowledgedMatchResult ? (
        <div className={styles.overlay}>
          <div className={styles.sheet}>
            <h3 className={styles.sheetTitle}>Rematch?</h3>
            {state?.isOvertime ? <p className={styles.sheetText}>Overtime: 1 minute. First pin or first to empty their hand wins; otherwise it&apos;s a draw.</p> : null}
            <div className={styles.progress} aria-label={`${Math.min(rematchVotesCount, 2)} of 2 players ready`}>
              <div className={styles.progressFill} style={{ width: `${Math.min(100, (rematchVotesCount / 2) * 100)}%` }} />
            </div>
            <p className={styles.sheetText}>{Math.min(rematchVotesCount, 2)} of 2 players ready</p>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => socket.emit("game:requestRematch", { gameId })}
              disabled={hasVotedForRematch}
            >
              {hasVotedForRematch ? "Waiting for opponent…" : "Rematch"}
            </button>
            <button className={styles.btn} onClick={() => socket.emit("game:end", { gameId })}>
              Back to menu
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
