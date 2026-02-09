"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";
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

const cardStyles: Record<string, string> = {
  TOP: "#1E90FF",
  BOTTOM: "#00AA00",
  NEUTRAL: "#000000",
  COUNTER: "#FF8C00",
  BONUS: "#A020F0",
  BLOODTIME: "#FF0000",
  STALLING: "#FFD700",
  OUT_OF_BOUNDS: "#808080",
  PENALTY: "#7CFC00",
  END_OF_PERIOD: "#A020F0",
  ATTEMPT_TAKEDOWN: "#111111",
  PIN: "#FFFFFF",
  TRIPOD: "#00AA00",
  SITOUT: "#00AA00",
};

const positionLabels: Record<Position, string> = {
  NEUTRAL: "Neutral",
  TOP: "Top",
  BOTTOM: "Bottom",
};

export default function GamePage() {
  const params = useParams();
  const gameId = params.id as string;

  const socket = useMemo(() => getSocket(), []);
  const [state, setState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const playerName = window.localStorage.getItem("grapple.playerName") ?? "Player";

    const onState = (s: GameState) => setState(s);
    const onError = (e: any) => setError(String(e));

    socket.on("game:state", onState);
    socket.on("game:error", onError);

    const join = () => {
        socket.emit("game:join", { gameId, playerName }, (response: any) => {
        if (!response.ok) {
            setError(response.error ?? "Unable to join");
            return;
        }
        if (response.playerId) setPlayerId(response.playerId);
        });
    };

    // ✅ join now if already connected, and also on every reconnect
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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Grapple Notes</h2>
          <p style={{ margin: "4px 0 0" }}>Game ID: {gameId}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 600 }}>{state ? `Phase: ${state.phase}` : "Connecting..."}</div>
          <div>Position: {state ? positionLabels[state.currentPosition] : "—"}</div>
          <div>{currentPlayer ? `Turn: ${currentPlayer.name}` : "Waiting for players..."}</div>
        </div>
      </header>

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
                  minWidth: 160,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontWeight: 600 }}>{player.name}</div>
                <div style={{ fontSize: 12 }}>Score: {player.score}</div>
                <div style={{ fontSize: 12 }}>Penalties: {player.penaltyPoints}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  {Array.from({ length: player.hand.length }).map((_, index) => (
                    <div
                      key={index}
                      style={{
                        width: 18,
                        height: 26,
                        borderRadius: 4,
                        background: "#222",
                        border: "1px solid #555",
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ display: "grid", placeItems: "center", gap: 12 }}>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <button
            onClick={() => socket.emit("turn:draw", { gameId })}
            disabled={!state || !isMyTurn || state.phase === "LOBBY"}
            style={{
              width: 140,
              height: 200,
              borderRadius: 12,
              background: "#1f2937",
              color: "#fff",
              border: "2px solid #111827",
              fontWeight: 600,
            }}
          >
            Draw Pile
            <div style={{ fontSize: 12, marginTop: 6 }}>{state ? state.drawPile.length : 0} cards</div>
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Discard</div>
            <div
              style={{
                width: 140,
                height: 200,
                borderRadius: 12,
                background: topCard ? topCard.color : "#eee",
                color: topCard && topCard.color === "#000000" ? "#fff" : "#111",
                border: "2px solid #ccc",
                display: "grid",
                placeItems: "center",
                padding: 12,
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              {topCard ? topCard.name : "No card"}
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
                  height: 200,
                  borderRadius: 12,
                  background: cardStyles[card.kind] ?? card.color,
                  color: card.color === "#000000" ? "#fff" : "#111",
                  border: "2px solid #111",
                  padding: 10,
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontSize: 12, textTransform: "uppercase" }}>{card.kind.replaceAll("_", " ")}</div>
                <div style={{ fontWeight: 700 }}>{card.name}</div>
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
