"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

export default function Home() {
  const router = useRouter();
  const socket = useMemo(() => io("http://localhost:3001", { transports: ["websocket"] }), []);

  const [gameCode, setGameCode] = useState("");
  const [playerName, setPlayerName] = useState("Player");
  const [errorMessage, setErrorMessage] = useState("");

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
    const requestedId = gameCode.trim();
    setErrorMessage("");
    socket.emit(
      "game:create",
      requestedId ? { gameId: requestedId } : null,
      (response: { ok: boolean; gameId?: string; error?: string }) => {
        if (response.ok && response.gameId) {
          router.push(`/game/${response.gameId}`);
          return;
        }
        if (response.error) {
          setErrorMessage(response.error);
        }
      },
    );
  }

  function joinGame() {
    const trimmedCode = gameCode.trim();
    if (!trimmedCode) {
      setErrorMessage("Enter a game id to join.");
      return;
    }
    window.localStorage.setItem("grapple.playerName", playerName);
    setErrorMessage("");
    router.push(`/game/${trimmedCode}`);
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
      {errorMessage ? <p style={{ color: "crimson", marginTop: 12 }}>{errorMessage}</p> : null}
    </div>
  );
}
