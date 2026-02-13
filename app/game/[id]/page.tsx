"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Card, Position } from "../../../shared/types";
import { getSocket } from "../../lib/socket";

type PlayerState = {
  id: string;
  name: string;
  hand: Card[];
  score: number;
  penaltyPoints: number;
};

type GameState = {
  id: string;
  players: PlayerState[];
  drawPile: Card[];
  discardPile: Card[];
  currentTurnIndex: number;
  currentPosition: Position;
  phase: "LOBBY" | "FIND_START_NEUTRAL" | "PLAY" | "ENDED";
  previousPosition?: Position;
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

export default function GamePage() {
  const params = useParams();
  const gameId = params.id as string;

  const socket = useMemo(() => getSocket(), []);
  const [state, setState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [rulesIndex, setRulesIndex] = useState(0);

  useEffect(() => {
    const playerName = window.localStorage.getItem("grapple.playerName") ?? "Player";

    const onState = (s: GameState) => setState(s);
    const onError = (e: unknown) => setError(String(e));

    socket.on("game:state", onState);
    socket.on("game:error", onError);

    const join = () => {
      socket.emit("game:join", { gameId, playerName }, (response: { ok: boolean; error?: string; playerId?: string }) => {
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
      socket.off("connect", join);
    };
  }, [socket, gameId]);

  const me = state?.players.find((player) => player.id === playerId) ?? null;
  const opponents = state?.players.filter((player) => player.id !== playerId) ?? [];
  const currentPlayer = state?.players[state.currentTurnIndex];
  const isMyTurn = Boolean(currentPlayer && currentPlayer.id === playerId);
  const topCard = state?.discardPile[state.discardPile.length - 1] ?? null;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Grapple Notes</h2>
          <p style={{ margin: "4px 0 0" }}>Game ID: {gameId}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #111",
              background: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {showRules ? "Hide Rules" : "Rules"}
          </button>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600 }}>{state ? `Phase: ${state.phase}` : "Connecting..."}</div>
            <div>Position: {state ? positionLabels[state.currentPosition] : "—"}</div>
            <div>{currentPlayer ? `Turn: ${currentPlayer.name}` : "Waiting for players..."}</div>
          </div>
        </div>
      </header>

      {showRules ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 16,
            background: "#fafafa",
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

      {error ? <div style={{ background: "#fee", border: "1px solid #f5c2c2", padding: 12 }}>{error}</div> : null}

      <section style={{ display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Opponents</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {opponents.length === 0 ? (
            <div>Waiting for opponents to join.</div>
          ) : (
            opponents.map((player) => (
              <div
                key={player.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 12,
                  minWidth: 180,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontWeight: 600 }}>{player.name}</div>
                <div style={{ fontSize: 12 }}>Score: {player.score}</div>
                <div style={{ fontSize: 12 }}>Penalties: {player.penaltyPoints}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  {Array.from({ length: player.hand.length }).map((_, index) => (
                    <Image
                      key={index}
                      src={BACK_OF_CARD}
                      alt="Face down card"
                      width={22}
                      height={32}
                      style={{ width: 22, height: 32, borderRadius: 4, border: "1px solid #555" }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ display: "grid", placeItems: "center", gap: 12 }}>
        <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => socket.emit("turn:draw", { gameId })}
            disabled={!state || !isMyTurn || state.phase === "LOBBY"}
            style={{
              width: 140,
              borderRadius: 12,
              background: "#fff",
              border: "2px solid #111827",
              fontWeight: 600,
              overflow: "hidden",
              padding: 8,
            }}
          >
            <Image src={BACK_OF_CARD} alt="Draw pile" width={120} height={172} style={{ width: "100%", height: "auto", borderRadius: 8 }} />
            <div style={{ fontSize: 12, marginTop: 6 }}>{state ? state.drawPile.length : 0} cards</div>
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Discard</div>
            <div style={{ width: 140 }}>
              <Image
                src={getCardImage(topCard)}
                alt={topCard ? topCard.name : "No card"}
                width={140}
                height={200}
                style={{ width: "100%", height: "auto", borderRadius: 12, border: "2px solid #ccc" }}
              />
            </div>
          </div>
        </div>

        {state?.phase === "LOBBY" ? (
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
        ) : null}
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Your Hand {me ? `(${me.hand.length})` : ""}</h3>
        {me ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {me.hand.map((card) => (
              <button
                key={card.id}
                onClick={() => socket.emit("turn:playCard", { gameId, cardId: card.id })}
                disabled={!isMyTurn || state?.phase === "LOBBY"}
                style={{
                  width: 140,
                  borderRadius: 12,
                  border: "2px solid #111",
                  background: "#fff",
                  padding: 0,
                  overflow: "hidden",
                }}
              >
                <Image
                  src={getCardImage(card)}
                  alt={card.name}
                  width={140}
                  height={200}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </button>
            ))}
          </div>
        ) : (
          <div>Joining game…</div>
        )}
      </section>
    </div>
  );
}
