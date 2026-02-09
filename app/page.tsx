"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

export default function Home() {
  const router = useRouter();
  const socket = useMemo(() => io("http://localhost:3001", { transports: ["websocket"] }), []);

  const [gameCode, setGameCode] = useState("");
  const [playerName, setPlayerName] = useState("Player");

  useEffect(() => {
    const storedName = window.localStorage.getItem("grapple.playerName");
    if (storedName) {
      setPlayerName(storedName);
    }
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  function createGame() {
    window.localStorage.setItem("grapple.playerName", playerName);
    socket.emit("game:create", null, (response: { ok: boolean; gameId?: string }) => {
      if (response.ok && response.gameId) {
        router.push(`/game/${response.gameId}`);
      }
    });
  }

  function joinGame() {
    if (!gameCode.trim()) return;
    window.localStorage.setItem("grapple.playerName", playerName);
    router.push(`/game/${gameCode.trim()}`);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Grapple Notes</h1>
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Player name"
        />
        <button onClick={createGame}>Create Game</button>
        <input value={gameCode} onChange={(e) => setGameCode(e.target.value)} placeholder="Enter game id" />
        <button onClick={joinGame}>Join</button>
      </div>
    </div>
  );
}
